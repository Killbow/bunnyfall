// @ts-check
// SAFE7 (2026-10-17, the chat safety plan, bible/11-Multiplayer/Chat-Safety-Arc.md section 8): THE CODE OF CONDUCT -
// the rules every player agrees to before their first line, and the rules the reviewer (server-account/src/modAi.js)
// reads every line against. ONE TEXT FOR BOTH: the reviewer's prompt is built from these same lines in English, so a
// player is never held to a rule they were not shown, and a rule changed here changes for both at once.
//
// THE VERSION IS A DATE, as the Terms' are (net/legalLaw.js). A player's agreement records the version they read
// (players.conduct_v); a new version asks every player again at their next line. Move it when a rule changes in
// substance - never for a typo. The service says whether the code as it stands is agreed on every token's mint
// (`conduct`) - AUDIT SAFE CLIENT-1: carried by the page's minter (net/accountClient.js accountTokenMinter, which had
// dropped it, so the card never stood) to the gate (scenes/chatSafetyHost.js adopt); a page that agreed keeps its yes
// until it reloads, so a mint already in flight cannot ask again, and a version moved while a page is open is asked
// at its next load.
//
// WHY THE EDGY JOKE IS NAMED. The rule against hate says "not even as a joke" because the joke is the form it takes in a
// game's chat: "jokes" about pride flags, asexual players called attention-seekers. A rule that left it unsaid would be
// argued around in the first hour.
//
// Not a DFU member: Daggerfall Unity has no chat. Ledger A row (ONLINE).
import { t } from '../../systems/textManager.js';

/** The code's version - its date. A player who agreed to an older one is asked again. */
export const CONDUCT_VERSION = '2026-10-29';   // BUNNYFALL: the server's own rules - everyone is asked again
/** What a version looks like. */
export const CONDUCT_VERSION_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The code's title. */
export const conductTitle = () => t('net.conduct.title', 'Code of Conduct');
/** The rules, in the player's language - each a line of its own. */
export const conductRules = () => [   // BUNNYFALL: the server's own rules (the Discord's), under keys of their own so no old translation stands in
  t('bf.conduct.r1', '1. 18+ only. This game has adult content. If you’re under 18, you can’t be here, and anyone found to be a minor is removed.'),
  t('bf.conduct.r2', '2. Respect everyone. Trans, queer, every race, every background: everyone is welcome here. Use people’s names and pronouns. Bigotry isn’t a “debate” or an “opinion” here.'),
  t('bf.conduct.r3', '3. Zero tolerance for hate. No real racism, transphobia, homophobia, antisemitism or other bigotry, including dog whistles and memes. No hate group symbols, propaganda or support.'),
  t('bf.conduct.r4', '4. Game screenshots go in #pictures. The game has nudity, so all in-game screenshots with nudity go in #pictures or in the bug reports, even the “harmless” ones. That keeps the other channels safe to open anywhere.'),
  t('bf.conduct.r5', '5. Flirting and sexual content. Outright sexual content is currently not allowed, to keep this space friendly for people who do not wish to engage in it. Joking sexually is fine if consensual; please respect boundaries.'),
  t('bf.conduct.r6', '6. No harassment. No targeting, stalking or pile-ons, and no unwanted DMs, especially sexual ones. If someone says stop, stop.'),
  t('bf.conduct.r7', '7. Keep private things private. Don’t share anyone’s personal info, photos or DMs without their permission.'),
  t('bf.conduct.r8', '8. No spam or self-promo. No ads, invite links or repeated messages unless the mods say it’s OK.'),
  t('bf.conduct.r9', '9. Bugs and cheats. Report bugs in the bug channel. Don’t use exploits against other players, and don’t share them publicly.'),
];
/** What follows a broken rule, and who reads a report. */
export const conductConsequence = () => t('net.conduct.consequence', 'Breaking these rules gets you muted, then muted for longer, then banned. Moderators read every report, with an automated reviewer helping them sort what comes in. /block hides a player from you, and /report sends their lines to the moderators.');
/** The button that agrees. */
export const conductAgreeLabel = () => t('net.conduct.agree', 'I agree');
/** The button that puts it off - the line stays unsent. */
export const conductLaterLabel = () => t('net.conduct.later', 'Not now');
