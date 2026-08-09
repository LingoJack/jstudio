export function UserMessageBubble({ content, images }: { content: string; images?: { base64: string; mediaType: string }[] }) {
  return (
    <div className="flex justify-end px-2 py-1">
      <div
        className="rounded-2xl rounded-br-md px-4 py-2.5 text-sm max-w-[70%] overflow-x-auto"
        style={{
          background: 'var(--vscode-button-background)',
          color: 'var(--vscode-button-foreground)',
        }}
      >
        {/* 图片预览 */}
        {images && images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {images.map((img, i) => (
              <img
                key={i}
                src={`data:${img.mediaType};base64,${img.base64}`}
                alt=""
                className="max-w-[200px] max-h-[200px] rounded-lg object-cover"
              />
            ))}
          </div>
        )}
        <div className="whitespace-pre-wrap break-words">{content}</div>
      </div>
    </div>
  );
}
