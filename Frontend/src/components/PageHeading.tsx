export function PageHeading({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) {
  const space = title.indexOf(" ");
  const first = space === -1 ? title : title.slice(0, space);
  const rest = space === -1 ? "" : title.slice(space);

  return (
    <div className="page-heading">
      <h1>
        <strong>{first}</strong>
        {rest}
      </h1>
      {subtitle ? <div className="page-sub">{subtitle}</div> : null}
    </div>
  );
}
