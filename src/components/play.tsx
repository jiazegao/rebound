/**
 * What the play screens share (solo practice, reviews, online matches, reader rooms, tiebreakers, the Visual lab):
 * a question that appears as it is read without moving anything below it, the main action where a thumb reaches it,
 * and a screen given over to the game on a phone.
 */
import { Fragment, useEffect, type ReactNode } from 'react';
import { splitRevealed, type Reading } from '../lib/reading';
import { RichText } from './QuestionView';

function lines(text: string): ReactNode {
  return text.split('\n').map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      <RichText text={line} />
    </Fragment>
  ));
}

/**
 * A question as it is read: the words read so far, the word still appearing (fainter), and the rest of the text in
 * its place but invisible. The card therefore has its full height from the first letter, lines break where they
 * will in the end, and nothing under the question moves while a player reaches for the Buzz button. The invisible
 * part is hidden from screen readers and from selection.
 */
export function RevealingText({ reading, count }: { reading: Reading; count: number }) {
  const { done, current } = splitRevealed(reading, count);
  const rest = reading.text.slice(done.length + current.length);
  return (
    <p className="stem" aria-live="off">
      {lines(done)}
      {current && <span className="reading-current">{current}</span>}
      {rest && (
        <span className="reading-rest" aria-hidden="true">
          {lines(rest)}
        </span>
      )}
    </p>
  );
}

/**
 * The main action of a play screen (Buzz, the next question). With a mouse and keyboard it sits under the question.
 * On a phone or tablet it is pinned to the bottom of the screen, full width: where a thumb reaches it, and where
 * nothing above can push it around (styles.css, .play-bar).
 */
export function PlayBar({ children }: { children: ReactNode }) {
  return <div className="play-bar">{children}</div>;
}

/**
 * While `active`, the page is a game in progress: on a phone or tablet the site's header and footer step aside
 * (styles.css, .in-play), and room is left at the bottom for the pinned action. The play screen keeps its own way
 * out (Stop, Leave).
 */
export function usePlayMode(active: boolean): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;
    document.documentElement.classList.add('in-play');
    return () => document.documentElement.classList.remove('in-play');
  }, [active]);
}
