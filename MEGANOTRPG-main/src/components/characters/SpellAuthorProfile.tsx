import "../../spell-author.css"

import { spellAuthorAttitudes, spellReferenceAuthor } from "../../data/spellReferenceAuthor"
import { spellClassLabel } from "../../lib/spellCatalog"

type Props = {
  onClose: () => void
}

export default function SpellAuthorProfile({ onClose }: Props) {
  return (
    <div className="sheet-backdrop spell-author-backdrop" onMouseDown={onClose}>
      <article className="bottom-sheet spell-author-sheet" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="character-editor-head">
          <div>
            <h3 className="sheet-title">{spellReferenceAuthor.name}</h3>
            <p className="sheet-copy">{spellReferenceAuthor.shortTitle}</p>
          </div>
          <button className="sheet-close" type="button" onClick={onClose}>×</button>
        </div>

        <div className="spell-author-intro">
          <p>{spellReferenceAuthor.intro}</p>
          <blockquote>{spellReferenceAuthor.creed}</blockquote>
        </div>

        <div className="spell-author-attitudes">
          <h4>Кого он терпит, а кого — к сожалению — тоже</h4>
          {spellAuthorAttitudes.map((attitude) => (
            <section key={attitude.classKey} className="spell-author-attitude">
              <div className="spell-author-attitude__head">
                <strong>{spellClassLabel(attitude.classKey)}</strong>
                <span>{attitude.respect}</span>
              </div>
              <h5>{attitude.title}</h5>
              <p>{attitude.summary}</p>
              <blockquote>{attitude.sample}</blockquote>
            </section>
          ))}
        </div>
      </article>
    </div>
  )
}
