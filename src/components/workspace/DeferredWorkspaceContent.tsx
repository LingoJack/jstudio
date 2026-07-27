import {
  startTransition,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import { useStore } from '../../store/useStore';
import type { UnifiedTab } from '../../store/workspaceSlice';
import DocumentPanel from '../editor/sectionEditor/DocumentPanel';
import EmptyPanel from '../ui/EmptyPanel';

interface DeferredWorkspaceContentProps {
  visible: boolean;
}

export default function DeferredWorkspaceContent({
  visible,
}: DeferredWorkspaceContentProps) {
  const activeTabId = useStore((s) => s.activeTabId);
  const selectedTab = useStore(
    (s) => s.tabs.find((tab) => tab.id === s.activeTabId) ?? null,
  );
  const [contentTab, setContentTab] = useState<UnifiedTab | null>(
    () => selectedTab,
  );

  useEffect(() => {
    const targetTabId = activeTabId;
    startTransition(() => {
      setContentTab((prev) =>
        useStore.getState().activeTabId === targetTabId ? selectedTab : prev,
      );
    });
  }, [activeTabId, selectedTab]);

  useLayoutEffect(() => {
    useStore.getState().commitTabContent(contentTab?.id ?? null);
  }, [contentTab]);

  if (!visible) return null;

  if (contentTab?.kind === 'document' && contentTab.docId) {
    return <DocumentPanel contentDocId={contentTab.docId} />;
  }

  return <EmptyPanel />;
}
