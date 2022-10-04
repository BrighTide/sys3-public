const { readdirSync, readFileSync } = require('fs')

const NOTES = 'C:/sync/documents/notes'

/**
 * @returns {string[]}
 * */
function getHeaders(text) {
   // this wants to be double hashes i think
   return Array.from(text.matchAll(/^#+ \S.+/gm)).map((x) => x[0])
}

const getNotes = () => readdirSync(NOTES)
   // Make note objects
   .flatMap((fileName) => {
      if (!fileName.includes('.md')) return []

      const noteText = readFileSync(`${NOTES}/${fileName}`).toString()

      return [
         {
            noteText,
            referrers: [],
            fileName,
            label: fileName.replace('.md', ''),
            hasBP: noteText.includes('💈'),
            hasScratch: /^(?:s|S|📜 S)cratch/.test(noteText),
            headers: getHeaders(noteText),
            tags: Array.from(noteText.matchAll(/#(\w\S*)/gm)).map(
               (match) => match[0],
            ),
         },
      ]
   })

   // Find links
   .map((note, _, notes) => {
      const linkMatch = note.noteText.matchAll(/\[\[(.*?)(?:#(.*?))?\]\]/g)

      const links = Array.from(linkMatch).map((match) => {
         const link = {
            origin: note,
            linkText: match[0],
            targetNoteLabel: match[1],
            targetNoteHeader: match[2] || null,
         }

         const target = notes.find(
            (n) => n.label === link.targetNoteLabel,
         )
         if (!target) {
            return { ...link, brokenLink: true }
         }
         target.referrers.push(link)
         return { ...link, target, brokenLink: false }
      })

      return { ...note, links }
   })

   // Add whether the note is a "going concern"
   .map((n) => ({
      ...n,
      isGoingConcern: !!(
         n.tags.length
          || n.hasBP
          || n.links.length
          || n.hasScratch
          || n.links.length
          || n.referrers.length),
   }))

module.exports = { getNotes, getHeaders }
