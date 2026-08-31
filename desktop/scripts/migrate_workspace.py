#!/usr/bin/env python3
"""
Migration script: Infer workspace from tool calls in transcript.
For each session, find the longest common prefix of all file paths used in tools.
"""

import json
import os
import re
from pathlib import Path
from typing import Optional


def extract_paths_from_transcript(transcript_path: str) -> list[str]:
    """Extract all file paths from tool calls in transcript.jsonl."""
    paths = []
    
    if not os.path.exists(transcript_path):
        return paths
    
    with open(transcript_path, 'r') as f:
        for line in f:
            if not line.strip():
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            
            # Extract from tool_calls (assistant messages)
            if 'tool_calls' in msg:
                for tc in msg['tool_calls']:
                    args = tc.get('arguments', '')
                    if isinstance(args, str):
                        try:
                            args_obj = json.loads(args)
                        except json.JSONDecodeError:
                            continue
                        
                        tool_name = tc.get('name', '')
                        
                        # Read/Write/Edit tool: path or file_path field
                        if 'path' in args_obj:
                            paths.append(args_obj['path'])
                        
                        if 'file_path' in args_obj:
                            paths.append(args_obj['file_path'])
                        
                        # Glob/Grep tool: pattern (extract directory part)
                        if 'pattern' in args_obj and tool_name in ('Glob', 'Grep'):
                            pattern = args_obj['pattern']
                            # Extract directory from pattern like "src/**/*.ts"
                            if not pattern.startswith('*') and not pattern.startswith('/'):
                                dir_part = pattern.split('*')[0].rstrip('/')
                                if dir_part and '/' in dir_part:
                                    paths.append(dir_part)
                        
                        # Bash tool: extract paths from command
                        if tool_name in ('Bash', 'Shell') and 'command' in args_obj:
                            cmd = args_obj['command']
                            # Extract cd target
                            cd_match = re.search(r'\bcd\s+([^\s;&|]+)', cmd)
                            if cd_match:
                                paths.append(cd_match.group(1))
                            # Extract file arguments
                            for arg_match in re.finditer(r'(?:^|\s)([~/]?[a-zA-Z0-9_./-]+/[a-zA-Z0-9_.-]+)', cmd):
                                path = arg_match.group(1)
                                if not path.startswith('-'):  # Not a flag
                                    paths.append(path)
            
            # Extract from tool results (Glob output contains file lists)
            if msg.get('role') == 'tool' and 'content' in msg:
                content = msg['content']
                # Match absolute file paths in tool output
                for match in re.finditer(r'(?:^|\n|\s)(/[/a-zA-Z0-9_.-]+)', content):
                    path = match.group(1)
                    # Filter out obvious non-paths
                    if not any(x in path for x in ['total ', 'drwx', '-rw', 'lrwx', 'Permission']):
                        paths.append(path)
    
    return paths


def normalize_path(path: str, session_dir: str) -> Optional[str]:
    """Normalize a path to absolute form if possible."""
    if not path:
        return None
    
    # Already absolute
    if path.startswith('/'):
        return path
    
    # Handle relative paths - try to resolve them
    # The workspace is typically where the user ran `j` from
    # We'll try resolving from common locations
    if path.startswith('..') or path.startswith('./') or (not path.startswith('/')):
        # Try resolving from parent directories of session dir
        # Session is at ~/.jdata/agent/data/sessions/{id}/
        # User's project is typically elsewhere
        return path  # Keep as-is for now, will be resolved in find_common_prefix
    
    # Relative path - will be resolved relative to workspace
    return path


def find_common_prefix(paths: list[str]) -> Optional[str]:
    """Find the longest common directory prefix among paths."""
    if not paths:
        return None
    
    # Normalize and filter
    normalized = []
    for p in paths:
        if p and not p.startswith('$') and len(p) > 1:
            # Get directory part if it's a file path
            if '.' in Path(p).name and not p.endswith('/'):
                p = str(Path(p).parent)
            normalized.append(p.rstrip('/'))
    
    if not normalized:
        return None
    
    # Find common prefix
    common = normalized[0]
    for p in normalized[1:]:
        # Find common prefix
        parts_common = common.split('/')
        parts_p = p.split('/')
        new_common = []
        for i in range(min(len(parts_common), len(parts_p))):
            if parts_common[i] == parts_p[i]:
                new_common.append(parts_common[i])
            else:
                break
        common = '/'.join(new_common)
        if not common:
            return None
    
    # Must have at least 3 path components to be meaningful (e.g., /Users/name/project)
    if common.count('/') < 3:
        return None
    
    return common


def infer_workspace(session_dir: str) -> Optional[str]:
    """Infer workspace from session transcript."""
    transcript_path = os.path.join(session_dir, 'transcript.jsonl')
    paths = extract_paths_from_transcript(transcript_path)
    
    if not paths:
        return None
    
    # Normalize paths
    normalized = []
    for p in paths:
        np = normalize_path(p, session_dir)
        if np:
            normalized.append(np)
    
    # Find common prefix
    workspace = find_common_prefix(normalized)
    return workspace


def migrate_session(session_dir: str, dry_run: bool = True) -> bool:
    """Migrate a single session, adding workspace field."""
    session_json_path = os.path.join(session_dir, 'session.json')
    
    if not os.path.exists(session_json_path):
        return False
    
    # Read existing session.json
    with open(session_json_path, 'r') as f:
        session = json.load(f)
    
    # Skip if already has workspace
    if 'workspace' in session and session['workspace']:
        print(f"  [skip] {session_dir} - already has workspace")
        return False
    
    # Infer workspace
    workspace = infer_workspace(session_dir)
    
    if not workspace:
        print(f"  [no workspace] {session_dir} - could not infer")
        return False
    
    # Update session
    session['workspace'] = workspace
    
    if dry_run:
        print(f"  [dry-run] {session_dir} -> {workspace}")
    else:
        with open(session_json_path, 'w') as f:
            json.dump(session, f, indent=2, ensure_ascii=False)
        print(f"  [migrated] {session_dir} -> {workspace}")
    
    return True


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Migrate agent sessions with workspace')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done')
    parser.add_argument('--sessions-dir', default=None, help='Sessions directory')
    args = parser.parse_args()
    
    # Find sessions directory
    if args.sessions_dir:
        sessions_dir = args.sessions_dir
    else:
        # Default: ~/.jdata/agent/data/sessions/
        home = os.path.expanduser('~')
        sessions_dir = os.path.join(home, '.jdata', 'agent', 'data', 'sessions')
    
    if not os.path.exists(sessions_dir):
        print(f"Sessions directory not found: {sessions_dir}")
        return
    
    print(f"Scanning sessions in: {sessions_dir}")
    print(f"Mode: {'dry-run' if args.dry_run else 'write'}")
    print()
    
    migrated = 0
    skipped = 0
    
    for entry in sorted(os.listdir(sessions_dir)):
        session_dir = os.path.join(sessions_dir, entry)
        if not os.path.isdir(session_dir):
            continue
        
        if migrate_session(session_dir, dry_run=args.dry_run):
            migrated += 1
        else:
            skipped += 1
    
    print()
    print(f"Done. Migrated: {migrated}, Skipped: {skipped}")


if __name__ == '__main__':
    main()
