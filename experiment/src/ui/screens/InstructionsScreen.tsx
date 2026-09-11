import { COLORS } from '../../config/task';

interface Props {
  onStart: () => void;
}

/**
 * The instructions describe the response and the point, and nothing about the
 * schedules. Telling participants that one side is richer, or that the
 * background color signals anything, would convert a discrimination the task
 * is measuring into an instruction they were given.
 */
export function InstructionsScreen({ onStart }: Props) {
  return (
    <main className="centered prose">
      <h1>How to play</h1>
      <ul>
        <li>
          Choose the left or right panel by clicking it, or by pressing the{' '}
          <kbd>F</kbd> and <kbd>J</kbd> keys.
        </li>
        <li>Some choices earn a point. The panel flashes when you earn one.</li>
        <li>Your goal is to earn as many points as you can.</li>
        <li>
          The background color will change from time to time. Keep playing
          as you were.
        </li>
      </ul>
      <p>
        The game lasts about 25 to 30 minutes. There are short practice turns
        first. Please keep this window in focus and do not reload the page.
      </p>
      <div className="swatches" aria-hidden="true">
        {Object.values(COLORS)
          .filter((c) => c.id !== 'neutral')
          .map((c) => (
            <span key={c.id} className="swatch" style={{ background: c.hex }} />
          ))}
      </div>
      <button className="primary" onClick={onStart}>
        Start
      </button>
    </main>
  );
}
