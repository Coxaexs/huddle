/**
 * Watches the microphone's link to the media server while it is sent at a
 * rate above what redundancy can carry (see `sfuMicPlan`).
 *
 * Up there every lost packet is heard, so the top rates only make sense on a
 * link that is not losing any. This reads what the server says it lost of
 * what we sent, smooths it, and says when the link has lost enough that the
 * seat is better off back at a rate with redundancy.
 */

import { ewma, lossBetween, type QosSample } from "./voice-qos";

export const HIFI_POLL_MS = 2000;
/**
 * Smoothed loss (0–1) at which the top rates are given up. Low on purpose: one
 * stray packet in ten seconds passes, one every few seconds does not. With
 * redundancy that seat would lose nothing, so it should have it.
 */
export const HIFI_MAX_LOSS = 0.005;

export class HifiLossWatch {
  private last: QosSample | null = null;
  private loss: number | null = null;

  /** Takes one stats sample. True once the link has lost too much to go without redundancy. */
  absorb(sample: QosSample): boolean {
    const previous = this.last;
    this.last = sample;
    // The first sample only sets the counters' starting point.
    if (!previous) return false;
    const loss = lossBetween(previous, sample);
    // A muted microphone sends nothing, which says nothing about the link.
    if (loss !== null) this.loss = ewma(this.loss, loss);
    return this.loss !== null && this.loss >= HIFI_MAX_LOSS;
  }

  /** Starts over, for a new sender. */
  reset(): void {
    this.last = null;
    this.loss = null;
  }
}
