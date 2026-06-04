type ContentCardProps = {
  children: React.ReactNode;
  className?: string;
  title?: string;
};

export default function ContentCard({
  children,
  className = "",
  title,
}: ContentCardProps) {
  return (
    <section className={`ui-card ${className}`}>
      {title ? (
        <h2 className="mb-4 text-lg font-black text-slate-950">{title}</h2>
      ) : null}
      {children}
    </section>
  );
}
