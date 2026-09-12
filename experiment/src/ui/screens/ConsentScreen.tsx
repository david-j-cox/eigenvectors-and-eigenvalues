import { useState, type ReactNode } from 'react';

interface Props {
  onAgree: () => void;
  onDecline: () => void;
  /**
   * Replaces the body of the "What you will do" paragraph only.
   *
   * This is the one paragraph that legitimately differs between studies in
   * this program, and the comment below records that duration and task
   * description are the only parts meant to change. Exposing it as a prop
   * keeps every other sentence byte-identical across tasks instead of
   * inviting a second, drifting copy of the whole form. Omit it and the
   * foraging task's approved wording is used unchanged.
   */
  whatYouWillDo?: ReactNode;
}

/**
 * Informed consent.
 *
 * The language, the required acknowledgement checkbox, and the contact details
 * are carried over verbatim from the sibling studies in this program
 * (`measuring-behavior-trajectories` and `perturbation-of-behavioral-trajectories`)
 * so that participants across the program see the same approved text. Only the
 * duration and the description of what the task involves are changed, because
 * those differ for this study.
 *
 * Do not edit the substance of this text without checking it against the
 * approved protocol.
 */
export function ConsentScreen({ onAgree, onDecline, whatYouWillDo }: Props) {
  const [read, setRead] = useState(false);

  return (
    <main className="centered prose">
      <h1>Informed Consent</h1>

      <div className="consent-body">
        <p>
          <strong>Study Title:</strong> Decision-Making Under Dynamic Conditions
        </p>
        <p>
          <strong>Principal Investigator:</strong> David J. Cox, Endicott College
        </p>
        <p>
          You are being invited to participate in a research study. Please read
          the following information carefully before deciding whether to take
          part.
        </p>
        <p>
          <strong>Purpose:</strong> This study investigates how people make
          repeated choices when outcomes may change over time.
        </p>
        <p>
          <strong>What you will do:</strong>{' '}
          {whatYouWillDo ?? (
            <>
              You will play a game (approximately 25-30 minutes total) in which
              you click panels to earn points. There is a brief practice round
              followed by the main task, which consists of several phases.
            </>
          )}
        </p>
        <p>
          <strong>Risks:</strong> There are no known risks beyond those of
          everyday computer use. You may experience mild boredom or fatigue.
        </p>
        <p>
          <strong>Benefits:</strong> There are no direct benefits to you. Your
          participation will contribute to scientific understanding of
          decision-making.
        </p>
        <p>
          <strong>Confidentiality:</strong> Your responses will be recorded with
          an anonymous identifier. No personally identifying information will be
          collected beyond your Prolific ID, which is stored separately from your
          data.
        </p>
        <p>
          <strong>Voluntary participation:</strong> Your participation is
          entirely voluntary. You may withdraw at any time by closing your
          browser, with no penalty.
        </p>
        <p>
          <strong>Data usage:</strong> De-identified data may be shared with
          other researchers or made publicly available for replication purposes.
        </p>
        <p>
          <strong>Contact:</strong> If you have questions about this study,
          please contact dcox@endicott.edu.
        </p>
      </div>

      <label className="consent-check">
        <input
          type="checkbox"
          checked={read}
          onChange={(e) => setRead(e.target.checked)}
        />
        I have read and understood the information above, and I voluntarily
        agree to participate in this study
      </label>

      <div className="row">
        <button className="primary" onClick={onAgree} disabled={!read}>
          I Agree &mdash; Participate
        </button>
        <button onClick={onDecline}>No Thanks</button>
      </div>
    </main>
  );
}
