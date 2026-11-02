/** Style memory words without changing the text or accessible name. */
export function MemoryText({ children }: { children: string }) {
  return (
    <>
      {children.split(/(\bmemor(?:y|ies)\b)/gi).map((part, index) =>
        /^memor(?:y|ies)$/i.test(part) ? (
          <span className="memory-word" key={index}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}
