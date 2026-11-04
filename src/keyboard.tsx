import { createContext, useContext, useId, useRef, useState, type ReactNode } from 'react';

interface Target {
  id: string;
  label: string;
  value: string;
  numeric: boolean;
  onChange: (value: string) => void;
}

interface KeyboardState {
  active: Target | null;
  setActive: (target: Target | null) => void;
}

const KeyboardContext = createContext<KeyboardState>({ active: null, setActive: () => undefined });

export function KeyboardProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Target | null>(null);
  const [upper, setUpper] = useState(false);
  function write(key: string) {
    if (!active) return;
    const value = key === 'Apagar' ? active.value.slice(0, -1) : active.value + (upper ? key.toUpperCase() : key);
    active.onChange(value);
    setActive({ ...active, value });
  }
  const rows = active?.numeric ? ['123', '456', '789', '+0'] : ['qwertyuiop', 'asdfghjklç', 'zxcvbnm', '@._-0123456789'];
  return <KeyboardContext.Provider value={{ active, setActive }}>
    <div className={active ? 'app keyboard-open' : 'app'}>{children}</div>
    {active && <section className="touch-keyboard" aria-label="Teclado na tela" onPointerDown={e => e.preventDefault()}>
      <div className="keyboard-heading"><span>{active.label}</span><button type="button" onClick={() => setActive(null)}>Concluir ✓</button></div>
      {rows.map(row => <div className="key-row" key={row}>{[...row].map(key => <button type="button" key={key} onClick={() => write(key)}>{upper ? key.toUpperCase() : key}</button>)}</div>)}
      <div className="key-row">
        {!active.numeric && <button type="button" onClick={() => setUpper(!upper)} aria-pressed={upper}>Maiúsc.</button>}
        {!active.numeric && <button type="button" className="space-key" onClick={() => write(' ')}>Espaço</button>}
        <button type="button" onClick={() => write('Apagar')}>⌫ Apagar</button>
      </div>
    </section>}
  </KeyboardContext.Provider>;
}

export function useKeyboard() { return useContext(KeyboardContext); }

export function Field({ label, value, onChange, type = 'text', placeholder, required = false, autoComplete = 'off' }: {
  label: string; value: string; onChange: (value: string) => void; type?: string;
  placeholder?: string; required?: boolean; autoComplete?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { active, setActive } = useKeyboard();
  const target = (next: string): Target => ({ id, label, value: next, onChange, numeric: type === 'tel' || type === 'number' });
  return <label className="field" htmlFor={id}>
    <span>{label}{required && <span className="required"> *</span>}</span>
    <input ref={inputRef} id={id} type={type} value={value} placeholder={placeholder} required={required}
      autoComplete={autoComplete} spellCheck={false}
      onFocus={() => {
        setActive(target(value));
        requestAnimationFrame(() => inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
      }}
      onChange={event => {
        onChange(event.target.value);
        if (active?.id === id) setActive(target(event.target.value));
      }} />
  </label>;
}
