interface Props {
  points: number;
  completionCode: string;
  pending: number;
  onDownload: () => void;
}

export function EndScreen({ points, completionCode, pending, onDownload }: Props) {
  return (
    <main className="centered prose">
      <h1>Finished</h1>
      <p>
        You earned <strong>{points}</strong> points. Thank you for taking part.
      </p>
      <p>
        Your completion code is <code className="code">{completionCode}</code>.
        Enter it in Prolific to be paid.
      </p>
      {pending > 0 && (
        <>
          <p className="warning">
            {pending} responses have not yet uploaded. Please stay on this page
            a few moments longer. If this message does not clear, download your
            data and contact the researcher.
          </p>
          <button onClick={onDownload}>Download my data</button>
        </>
      )}
    </main>
  );
}
