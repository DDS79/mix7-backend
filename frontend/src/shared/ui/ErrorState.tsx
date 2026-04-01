export function ErrorState(props: { title?: string; message: string }) {
  return (
    <div className="state-block state-error">
      <h2>{props.title ?? 'Something went wrong'}</h2>
      <p>{props.message}</p>
    </div>
  );
}
