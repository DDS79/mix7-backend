export function EmptyState(props: { title: string; message: string }) {
  return (
    <div className="state-block">
      <h2>{props.title}</h2>
      <p>{props.message}</p>
    </div>
  );
}
