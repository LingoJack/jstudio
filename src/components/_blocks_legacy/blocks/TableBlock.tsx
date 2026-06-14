import { Table as TableIcon } from 'lucide-react';
import type { BaseBlockProps } from './types';

/**
 * TYPE: table — an editable grid with add/remove row/column controls.
 */
export default function TableBlock({ block, onUpdateBlock }: BaseBlockProps) {
  const tableData: string[][] = block.properties?.tableData || [
    ['A', 'B'],
  ];

  const handleTableCellEdit = (
    rowIdx: number,
    colIdx: number,
    val: string,
  ) => {
    const updated = [...tableData];
    updated[rowIdx] = [...updated[rowIdx]];
    updated[rowIdx][colIdx] = val;
    onUpdateBlock({ properties: { ...block.properties, tableData: updated } });
  };

  const addTableColumn = () => {
    const updated = tableData.map((row) => [...row, '']);
    onUpdateBlock({ properties: { ...block.properties, tableData: updated } });
  };

  const removeTableColumn = () => {
    if (tableData[0].length <= 1) return;
    const updated = tableData.map((row) => row.slice(0, -1));
    onUpdateBlock({ properties: { ...block.properties, tableData: updated } });
  };

  const addTableRow = () => {
    const numCols = tableData[0].length;
    const newRow = Array(numCols).fill('');
    onUpdateBlock({
      properties: {
        ...block.properties,
        tableData: [...tableData, newRow],
      },
    });
  };

  const removeTableRow = () => {
    if (tableData.length <= 1) return;
    onUpdateBlock({
      properties: {
        ...block.properties,
        tableData: tableData.slice(0, -1),
      },
    });
  };

  return (
    <div className="overflow-x-auto rounded-sm p-3 bg-[var(--vscode-textBlockQuote-background)]">
      <div className="text-xs font-semibold text-[var(--vscode-foreground)] flex items-center gap-1 mb-2">
        <TableIcon className="w-3.5 h-3.5" />
        <span>交互式数据表格</span>
      </div>

      <table className="w-full text-xs text-left text-[var(--vscode-foreground)] border-collapse">
        <tbody>
          {tableData.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              className={`${
                rowIdx === 0
                  ? 'bg-[var(--vscode-list-hoverBackground)] font-semibold'
                  : ''
              }`}
            >
              {row.map((cell, colIdx) => (
                <td key={colIdx} className="p-1.5">
                  <input
                    type="text"
                    value={cell}
                    onChange={(e) =>
                      handleTableCellEdit(rowIdx, colIdx, e.target.value)
                    }
                    className="w-full bg-transparent border-none text-xs text-[var(--vscode-editor-foreground)] focus:outline-none px-1 py-0.5 rounded"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center gap-3 mt-3 text-[10px] text-[var(--vscode-descriptionForeground)] justify-end pt-3">
        <div className="flex gap-1.5">
          <button
            onClick={addTableRow}
            className="cursor-pointer bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] px-2 py-0.5 rounded"
          >
            + 新增行
          </button>
          <button
            onClick={removeTableRow}
            className="cursor-pointer text-[var(--vscode-errorForeground)] px-2 py-0.5 rounded"
          >
            - 裁减行
          </button>
        </div>

        <div className="flex gap-1.5">
          <button
            onClick={addTableColumn}
            className="cursor-pointer bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] px-2 py-0.5 rounded"
          >
            + 新增列
          </button>
          <button
            onClick={removeTableColumn}
            className="cursor-pointer text-[var(--vscode-errorForeground)] px-2 py-0.5 rounded"
          >
            - 裁减列
          </button>
        </div>
      </div>
    </div>
  );
}
