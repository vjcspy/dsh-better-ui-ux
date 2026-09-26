/**
 * Header model badge stylesheet.
 *
 * Injected as one `<style data-plugin="dsh-better-ui-ux">` element rather than
 * shipped as a CSS Module: a dynamic plugin bundle has no static stylesheet edge,
 * and the shell's bundler never sees this package. The element is appended under
 * the palette class the badge itself carries — the shell's theme root — so the
 * semantic `--dsw-*` aliases resolve against the active palette, and every value
 * here is one of those aliases rather than a literal colour.
 *
 * The hook is idempotent: two activations (an HMR reload, or a second mount in the
 * same document) share the one element instead of stacking copies.
 */

/** Element id of the injected stylesheet. */
const STYLE_ELEMENT_ID = 'dsh-better-ui-ux-styles'

/** Badge root class. Its position also anchors the injected rules. */
export const MODEL_BADGE_CLASS = 'dsh-model-badge'

/** Pending-marker class, for the part of the label the badge adds itself. */
export const MODEL_BADGE_MARKER_CLASS = 'dsh-model-badge-marker'

/** The stylesheet text. One rule block per class, no nesting. */
const SHEET = `
.${MODEL_BADGE_CLASS} {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 220px;
  height: 22px;
  padding: 0 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-xs);
  background: var(--dsw-alias-fill-tsp-secondary);
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 22px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.${MODEL_BADGE_MARKER_CLASS} {
  flex: none;
  color: var(--dsw-alias-label-secondary);
}
`

/**
 * Append the badge stylesheet once per document.
 * @param doc - document to install into.
 */
export function installModelBadgeStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ELEMENT_ID) !== null) return
  const element = doc.createElement('style')
  element.id = STYLE_ELEMENT_ID
  element.setAttribute('data-plugin', 'dsh-better-ui-ux')
  element.textContent = SHEET
  doc.head.append(element)
}
