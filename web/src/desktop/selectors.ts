import type { Event } from '../api/types';

export function recentMessages(events: Event[], limit = 6): Event[] {
  return events.filter((entry) => entry.kind === 'text_in' || entry.kind === 'text_out')
    .sort((first, second) => second.id - first.id).slice(0, limit).reverse();
}
