export function Button({ children, className = 'gradient-btn', ...props }) {
  return <button className={className} {...props}>{children}</button>;
}

export function Card({ children, className = '' }) {
  return <section className={`card ${className}`}>{children}</section>;
}
