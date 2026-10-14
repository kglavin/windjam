import { TOOLS, type Tool } from './tools';

interface Props {
  tool: Tool;
  onSelect: (tool: Tool) => void;
  allowed?: Tool[]; // when set, only these tools are offered
}

export function Toolbar({ tool, onSelect, allowed }: Props) {
  const hint = TOOLS.find((t) => t.id === tool)!.hint;
  return (
    <div className="toolbar">
      <div className="seg">
        {TOOLS.filter((t) => !allowed || allowed.includes(t.id)).map((t) => (
          <button key={t.id} className={t.id === tool ? 'active' : ''} onClick={() => onSelect(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <span className="toolbar-hint">
        {hint} Scroll to zoom, drag to pan.
      </span>
    </div>
  );
}
