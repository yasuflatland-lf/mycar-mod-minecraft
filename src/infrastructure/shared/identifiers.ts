/** Prefix of every ID this add-on defines. */
export const NAMESPACE = "yasu_ride";
export function id(name: string): string {
  return `${NAMESPACE}:${name}`;
}

export const DECK_SEAT_TYPE = id("deck_seat");
export const DECK_SEATS_PROPERTY = id("deck_seats");
export const DECK_SEAT_OF_PROPERTY = id("deck_seat_of");
