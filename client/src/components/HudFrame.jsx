// HUD-панель із кутовими дужками.
export default function HudFrame({ children, className = '', ...rest }) {
  return (
    <div className={`panel ${className}`} {...rest}>
      <span className="corner corner--tl" />
      <span className="corner corner--tr" />
      <span className="corner corner--bl" />
      <span className="corner corner--br" />
      {children}
    </div>
  );
}
