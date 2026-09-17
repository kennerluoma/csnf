/* Pure input sanitizing for /api/contact, pulled out for testing. */

/* name/subject land unescaped in the outgoing email's subject line: a CR/LF would let a sender
   inject extra header-like lines there. Also caps length well past anything a real inquiry needs. */
export function oneLine(s: string, max: number): string {
  return s.replace(/[\r\n]+/g, ' ').slice(0, max)
}
