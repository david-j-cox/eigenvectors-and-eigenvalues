interface Props {
  onAgree: () => void;
  onDecline: () => void;
}

export function ConsentScreen({ onAgree, onDecline }: Props) {
  return (
    <main className="centered prose">
      <h1>Consent to take part</h1>
      <p>
        This study asks you to play a simple two-option game for about
        25 to 30 minutes. On each turn you choose one of two panels. Some
        choices earn points and some do not.
      </p>
      <p>
        We record which option you chose, when you chose it, and whether it
        earned a point. We do not record anything else about you. Your data are
        stored under your Prolific ID only.
      </p>
      <p>
        Taking part is voluntary. You may stop at any time by closing the
        window, though payment depends on completing the task.
      </p>
      <div className="row">
        <button className="primary" onClick={onAgree}>
          I agree to take part
        </button>
        <button onClick={onDecline}>I do not agree</button>
      </div>
    </main>
  );
}
