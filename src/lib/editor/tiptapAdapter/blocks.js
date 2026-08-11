import { isAssetPath } from "../content/assetUrl";
import { richTextToTiptapInline, tiptapInlineToRichText } from "./richText";
import { tableDataToTiptap, tiptapToTableData } from "./table";
import { listItemToTiptap, tiptapToListItems, legacyFlatListToItems, listItemsToFlat } from "./list";
import { todoItemToTiptap, tiptapToTodoItems } from "./todo";
function headingLevel(type) {
  switch (type) {
    case "heading-1":
      return 1;
    case "heading-2":
      return 2;
    case "heading-3":
      return 3;
    case "heading-4":
      return 4;
    case "heading-5":
      return 5;
    case "heading-6":
      return 6;
    default:
      return 1;
  }
}
function ourTypeToTiptapType(type) {
  switch (type) {
    case "text":
      return "paragraph";
    case "heading-1":
    case "heading-2":
    case "heading-3":
    case "heading-4":
    case "heading-5":
    case "heading-6":
      return "heading";
    case "quote":
      return "blockquote";
    case "code":
      return "codeBlock";
    case "image":
      return "image";
    case "file":
      return "fileBlock";
    case "table":
      return "table";
    case "bullet-list":
      return "bulletList";
    case "ordered-list":
      return "orderedList";
    case "todo-list":
      return "taskList";
    case "divider":
      return "horizontalRule";
    case "collapsible":
      return "collapsible";
    case "link":
      return "linkBlock";
    case "diagram":
      return "diagramBlock";
    case "math":
      return "mathBlock";
    default:
      return "paragraph";
  }
}
function tiptapTypeToOurType(nodeType, attrs) {
  switch (nodeType) {
    case "paragraph":
      return "text";
    case "heading":
      const level = attrs.level;
      if (level === 1) return "heading-1";
      if (level === 2) return "heading-2";
      if (level === 3) return "heading-3";
      if (level === 4) return "heading-4";
      if (level === 5) return "heading-5";
      if (level === 6) return "heading-6";
      return "heading-1";
    case "blockquote":
      return "quote";
    case "codeBlock":
      return "code";
    case "image":
      return "image";
    case "fileBlock":
      return "file";
    case "table":
      return "table";
    case "bulletList":
      return "bullet-list";
    case "orderedList":
      return "ordered-list";
    case "taskList":
      return "todo-list";
    case "horizontalRule":
      return "divider";
    case "collapsible":
      return "collapsible";
    case "linkBlock":
      return "link";
    case "diagramBlock":
      return "diagram";
    case "mathBlock":
      return "math";
    default:
      return "text";
  }
}
function ourBlockToTiptapJSON(block) {
  const nodeType = ourTypeToTiptapType(block.type);
  const json = {
    type: nodeType,
    attrs: {
      id: block.id
    }
  };
  switch (block.type) {
    case "text": {
      const inline = richTextToTiptapInline(block.content);
      if (inline.length > 0) {
        json.content = inline;
      }
      break;
    }
    case "heading-1":
    case "heading-2":
    case "heading-3":
    case "heading-4":
    case "heading-5":
    case "heading-6": {
      json.attrs = { ...json.attrs, level: headingLevel(block.type) };
      const inline = richTextToTiptapInline(block.content);
      if (inline.length > 0) {
        json.content = inline;
      }
      break;
    }
    case "quote": {
      const inline = richTextToTiptapInline(block.content);
      json.content = [
        {
          type: "paragraph",
          ...inline.length > 0 ? { content: inline } : {}
        }
      ];
      break;
    }
    case "code": {
      const rich = block.content;
      const code = rich[0]?.text ?? "";
      if (code) {
        json.content = [{ type: "text", text: code }];
      }
      json.attrs = {
        ...json.attrs,
        language: block.properties?.language ?? "plaintext",
        collapsed: block.properties?.codeCollapsed ?? false,
        htmlPreview: block.properties?.codeHtmlPreview ?? false,
        maxHeightPct: block.properties?.codeMaxHeightPct ?? null,
        width: block.properties?.codeWidth ?? null,
        widthPct: block.properties?.codeWidthPct ?? null,
        height: block.properties?.codeHeight ?? null,
        heightPct: block.properties?.codeHeightPct ?? null,
        title: block.properties?.codeTitle ?? ""
      };
      break;
    }
    case "image": {
      const src = typeof block.content === "string" ? block.content : "";
      json.attrs = {
        ...json.attrs,
        src,
        alt: block.properties?.caption ?? "",
        width: block.properties?.width ?? null,
        widthPct: block.properties?.widthPct ?? null,
        height: block.properties?.height ?? null,
        heightPct: block.properties?.heightPct ?? null,
        align: block.properties?.align ?? "center"
      };
      break;
    }
    case "file": {
      const src = typeof block.content === "string" ? block.content : "";
      json.attrs = {
        ...json.attrs,
        src,
        fileName: block.properties?.fileName ?? "",
        fileSize: block.properties?.fileSize ?? 0,
        fileType: block.properties?.fileType ?? "",
        displayMode: block.properties?.fileDisplayMode ?? "card",
        width: block.properties?.fileWidth ?? null,
        widthPct: block.properties?.fileWidthPct ?? null,
        height: block.properties?.fileHeight ?? null,
        heightPct: block.properties?.fileHeightPct ?? null,
        align: block.properties?.fileAlign ?? "center"
      };
      break;
    }
    case "link": {
      const url = typeof block.content === "string" ? block.content : "";
      json.attrs = {
        ...json.attrs,
        url,
        title: block.properties?.linkTitle ?? "",
        description: block.properties?.linkDescription ?? "",
        favicon: block.properties?.linkFavicon ?? "",
        ogImage: block.properties?.linkOgImage ?? "",
        siteName: block.properties?.linkSiteName ?? "",
        displayMode: block.properties?.linkDisplayMode ?? "card",
        width: block.properties?.linkWidth ?? null,
        widthPct: block.properties?.linkWidthPct ?? null,
        align: block.properties?.linkAlign ?? "center"
      };
      break;
    }
    case "diagram": {
      json.attrs = {
        ...json.attrs,
        snapshot: block.properties?.diagramSnapshot ?? "",
        width: block.properties?.diagramWidth ?? null,
        widthPct: block.properties?.diagramWidthPct ?? null,
        height: block.properties?.diagramHeight ?? null,
        heightPct: block.properties?.diagramHeightPct ?? null,
        align: block.properties?.diagramAlign ?? "center"
      };
      break;
    }
    case "math": {
      json.attrs = {
        ...json.attrs,
        latex: block.properties?.mathLatex ?? ""
      };
      break;
    }
    case "table": {
      const tableData = block.properties?.tableData;
      if (tableData) {
        json.content = tableDataToTiptap(tableData);
      }
      json.attrs = {
        ...json.attrs,
        collapsed: tableData?.collapsed ?? false
      };
      break;
    }
    case "bullet-list":
    case "ordered-list": {
      const listType = block.type === "bullet-list" ? "bulletList" : "orderedList";
      const items = block.properties?.listItems ?? legacyFlatListToItems(block.content);
      json.content = items.map((item) => listItemToTiptap(item, listType));
      break;
    }
    case "todo-list": {
      const items = block.properties?.todoItems ?? [];
      json.content = items.map(todoItemToTiptap);
      break;
    }
    case "divider": {
      break;
    }
    case "collapsible": {
      json.attrs = {
        ...json.attrs,
        open: block.properties?.collapsibleOpen ?? true,
        summary: block.properties?.collapsibleSummary ?? ""
      };
      const children = block.properties?.collapsibleChildren;
      if (children && children.length > 0) {
        json.content = children;
      } else {
        json.content = [{ type: "paragraph" }];
      }
      break;
    }
    default:
      break;
  }
  return json;
}
function ourBlocksToTiptapJSON(blocks) {
  if (!blocks || blocks.length === 0) {
    return [{ type: "paragraph" }];
  }
  return blocks.map(ourBlockToTiptapJSON);
}
function tiptapJSONToOurBlock(node) {
  const nodeType = node.type ?? "paragraph";
  const attrs = node.attrs ?? {};
  const ourType = tiptapTypeToOurType(nodeType, attrs);
  const block = {
    id: typeof node.attrs?.id === "string" ? node.attrs.id : crypto.randomUUID(),
    type: ourType,
    content: []
  };
  switch (ourType) {
    case "text":
    case "heading-1":
    case "heading-2":
    case "heading-3":
    case "heading-4":
    case "heading-5":
    case "heading-6": {
      block.content = tiptapInlineToRichText(node.content ?? []);
      break;
    }
    case "quote": {
      const allInline = [];
      for (const child of node.content ?? []) {
        if (child.type === "paragraph") {
          if (allInline.length > 0) allInline.push({ text: "\n", annotations: {} });
          const seg = tiptapInlineToRichText(child.content ?? []);
          allInline.push(...seg);
        }
      }
      block.content = allInline;
      break;
    }
    case "code": {
      const children = node.content ?? [];
      const codeText = children.map((c) => c.type === "text" ? c.text ?? "" : "").join("");
      block.content = [{ text: codeText, annotations: {} }];
      block.properties = {
        language: attrs.language ?? "plaintext",
        codeCollapsed: attrs.collapsed === true ? true : void 0,
        codeHtmlPreview: attrs.htmlPreview === true ? true : void 0,
        codeMaxHeightPct: typeof attrs.maxHeightPct === "number" ? attrs.maxHeightPct : void 0,
        codeWidth: typeof attrs.width === "number" ? attrs.width : void 0,
        codeWidthPct: typeof attrs.widthPct === "number" ? attrs.widthPct : void 0,
        codeHeight: typeof attrs.height === "number" ? attrs.height : void 0,
        codeHeightPct: typeof attrs.heightPct === "number" ? attrs.heightPct : void 0,
        codeTitle: typeof attrs.title === "string" && attrs.title.length > 0 ? attrs.title : void 0
      };
      break;
    }
    case "image": {
      const src = typeof attrs.src === "string" ? attrs.src : "";
      const alt = typeof attrs.alt === "string" ? attrs.alt : "";
      const width = typeof attrs.width === "number" ? attrs.width : void 0;
      const widthPct = typeof attrs.widthPct === "number" ? attrs.widthPct : void 0;
      const height = typeof attrs.height === "number" ? attrs.height : void 0;
      const heightPct = typeof attrs.heightPct === "number" ? attrs.heightPct : void 0;
      const align = attrs.align === "left" || attrs.align === "center" ? attrs.align : "center";
      block.content = src;
      block.properties = {
        caption: alt,
        imageType: isAssetPath(src) ? "asset" : src.startsWith("data:") ? "base64" : "url",
        width,
        widthPct,
        height,
        heightPct,
        align
      };
      break;
    }
    case "file": {
      const src = typeof attrs.src === "string" ? attrs.src : "";
      block.content = src;
      block.properties = {
        fileName: typeof attrs.fileName === "string" ? attrs.fileName : "",
        fileSize: typeof attrs.fileSize === "number" ? attrs.fileSize : 0,
        fileType: typeof attrs.fileType === "string" ? attrs.fileType : "",
        fileDisplayMode: attrs.displayMode === "preview" ? "preview" : "card",
        fileWidth: typeof attrs.width === "number" ? attrs.width : void 0,
        fileWidthPct: typeof attrs.widthPct === "number" ? attrs.widthPct : void 0,
        fileHeight: typeof attrs.height === "number" ? attrs.height : void 0,
        fileHeightPct: typeof attrs.heightPct === "number" ? attrs.heightPct : void 0,
        fileAlign: attrs.align === "left" || attrs.align === "center" ? attrs.align : "center"
      };
      break;
    }
    case "link": {
      const url = typeof attrs.url === "string" ? attrs.url : "";
      block.content = url;
      block.properties = {
        linkTitle: typeof attrs.title === "string" ? attrs.title : "",
        linkDescription: typeof attrs.description === "string" ? attrs.description : "",
        linkFavicon: typeof attrs.favicon === "string" ? attrs.favicon : "",
        linkOgImage: typeof attrs.ogImage === "string" ? attrs.ogImage : "",
        linkSiteName: typeof attrs.siteName === "string" ? attrs.siteName : "",
        linkDisplayMode: attrs.displayMode === "preview" ? "preview" : "card",
        linkWidth: typeof attrs.width === "number" ? attrs.width : void 0,
        linkWidthPct: typeof attrs.widthPct === "number" ? attrs.widthPct : void 0,
        linkAlign: attrs.align === "left" || attrs.align === "center" ? attrs.align : "center"
      };
      break;
    }
    case "diagram": {
      block.content = [];
      block.properties = {
        diagramSnapshot: typeof attrs.snapshot === "string" ? attrs.snapshot : "",
        diagramWidth: typeof attrs.width === "number" ? attrs.width : void 0,
        diagramWidthPct: typeof attrs.widthPct === "number" ? attrs.widthPct : void 0,
        diagramHeight: typeof attrs.height === "number" ? attrs.height : void 0,
        diagramHeightPct: typeof attrs.heightPct === "number" ? attrs.heightPct : void 0,
        diagramAlign: attrs.align === "left" || attrs.align === "center" ? attrs.align : "center"
      };
      break;
    }
    case "math": {
      block.content = [];
      block.properties = {
        mathLatex: typeof attrs.latex === "string" ? attrs.latex : ""
      };
      break;
    }
    case "table": {
      block.content = [];
      const tableData = tiptapToTableData(node);
      tableData.collapsed = node.attrs?.collapsed === true;
      block.properties = { tableData };
      break;
    }
    case "bullet-list":
    case "ordered-list": {
      const listItems = tiptapToListItems(node);
      block.properties = { listItems };
      block.content = listItemsToFlat(listItems);
      break;
    }
    case "todo-list": {
      block.content = [];
      block.properties = { todoItems: tiptapToTodoItems(node) };
      break;
    }
    case "divider": {
      block.content = [];
      break;
    }
    case "collapsible": {
      block.content = [];
      block.properties = {
        collapsibleOpen: typeof attrs.open === "boolean" ? attrs.open : true,
        collapsibleSummary: typeof attrs.summary === "string" ? attrs.summary : "",
        // Store the full child node JSON so it round-trips losslessly.
        collapsibleChildren: node.content ?? []
      };
      break;
    }
    default:
      break;
  }
  return block;
}
function tiptapJSONToOurBlocks(nodes) {
  if (!nodes || nodes.length === 0) return [];
  return nodes.map(tiptapJSONToOurBlock);
}
function stripTrailingEmptyParagraph(blocks) {
  if (blocks.length <= 1) return blocks;
  const last = blocks[blocks.length - 1];
  if (last.type !== "text") return blocks;
  const content = last.content;
  if (!content || content.length === 0) {
    return blocks.slice(0, -1);
  }
  return blocks;
}
export {
  headingLevel,
  ourBlockToTiptapJSON,
  ourBlocksToTiptapJSON,
  stripTrailingEmptyParagraph,
  tiptapJSONToOurBlock,
  tiptapJSONToOurBlocks
};
