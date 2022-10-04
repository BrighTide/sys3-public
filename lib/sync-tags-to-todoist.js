/* eslint-disable no-restricted-syntax */
require('dotenv').config()
const Todoist = require('todoist').v8
const fs = require('fs')
const moment = require('moment')
const { inject } = require('./utils')
const { addToAllScratch } = require('./add-to-all-scratch')
const { addToDailyLog, nameDay } = require('./journal')
const { log } = require('./log')
// @ts-ignore
const { getNotes } = require('./note')

const NOTE_PROJECT_ID = 2293249785

// @ts-ignore
const todoist = Todoist(process.env.TODOIST_ACCESS_TOKEN)

/**
 * @param {String} text
 */
function getHeaders(text) {
   // this wants to be double hashes i think
   return Array.from(text.matchAll(/^## \S.+/gm)).map((x) => x[0])
}

const NOTES = 'C:/sync/documents/notes'

// whenever a new file gets added, sync that shit (or just run once ery x mins)
// replace console log with log
// put toasts in appropriate places

// TODO
// can a section have any character, or do we need to do the comment trick?
// if a projct gets created then do it

async function syncScratches() {
   await todoist.sync(['projects', 'sections', 'labels', 'items'])

   const todoistProjects = todoist.projects.get()
   const todoistSections = todoist.sections.get()
   const todoistLabels = todoist.labels.get()
   const todoistTasks = todoist.items.get()

   // @ts-ignore
   const PROJECT_NAME_LABEL = todoistLabels.find(
      (l) => l.name === 'project-name',
   ).id
   // @ts-ignore
   const SECTION_NAME_LABEL = todoistLabels.find(
      (l) => l.name === 'section-name',
   ).id
   // @ts-ignore
   const DAY_NAME_LABEL = todoistLabels.find(
      (l) => l.name === 'day-name',
   ).id
   const todoistInboxProject = todoistProjects.find((p) => p.name === 'Inbox')
   if (!todoistInboxProject) throw new Error('Could not find todoist inbox project')

   const todoistTasksThatAreScratches = todoistTasks.filter(
      (t) => !t.labels.includes(PROJECT_NAME_LABEL)
      && !t.labels.includes(SECTION_NAME_LABEL)
      && (
         !!todoistProjects.find(
            (p) => p.id === t.project_id && p.parent_id === NOTE_PROJECT_ID,
         )
         || t.project_id === todoistInboxProject.id
      ),
   )

   for (const task of todoistTasksThatAreScratches) {
      if (task.labels.includes(DAY_NAME_LABEL)) {
         log(`Naming day "${task.content}"`)
         nameDay(task.content)
         await todoist.items.complete({ id: task.id })
         return
      }

      const project = todoistProjects.find((s) => s.id === task.project_id)
      const section = todoistSections.find((s) => s.id === task.section_id)

      // @ts-ignore
      const taskText = `${task.content}${task.description ? `\n${task.description}` : ''}`

      // @ts-ignore
      const projectNameTask = todoistTasks.find((t) => t.project_id === project.id && t.labels.includes(PROJECT_NAME_LABEL))
      const sectionNameTask = section ? todoistTasks.find((t) => t.section_id === section.id && t.labels.includes(SECTION_NAME_LABEL)) : null

      let noteLabel = projectNameTask ? projectNameTask.content : null
      let blockIdentifier = sectionNameTask ? sectionNameTask.content : null

      const time = moment(task.date_added)

      // confirm the note/header exists for the project/section
      let noteFile = `${NOTES}/${noteLabel}.md`
      let note = await new Promise((resolve) => fs.readFile(noteFile, (err, data) => resolve(err ? null : data.toString())))

      if (note === null) {
         log(
            `could not find note to match project name "${noteLabel}", dumping to mnestic`,
         )
         noteLabel = 'mnestic'
         noteFile = `${NOTES}/mnestic.md`
         note = fs.readFileSync(noteFile)
         blockIdentifier = '🔥 Front'
      } else {
         const headers = getHeaders(note)

         if (sectionNameTask) {
            const headerExists = !!headers.find((h) => h === sectionNameTask.content)
            if (!headerExists) {
               log(
               // @ts-ignore
                  `could not find header to match section "${sectionNameTask.content}" in project "${noteLabel}" dumping to scratch section`,
               )
               blockIdentifier = '📜 Scratch'
            }
         } else {
            blockIdentifier = '📜 Scratch'
         }
      }

      const toInject = `${time.format('DD-MM-YY HH.mm')}: ${taskText}`

      log('adding scratch:', `<📜 ${noteLabel}> ${taskText}`)
      inject('append', {
         file: noteFile,
         text: note,
         toInject,
         // @ts-ignore
         blockIdentifier,
         createBlockIfMissing: true,
         spacer: true,
         indent: true,
      })

      // add to all scratch and weekly journal
      addToAllScratch(`<📜 ${noteLabel}> ${taskText}`)
      addToDailyLog(`<📜 ${noteLabel}> ${taskText}`)

      log(`Completing todo "${task.content}"`)
      await todoist.items.complete({ id: task.id })
   }
}

async function syncNotesAndHeaders() {
   await todoist.sync()

   const todoistProjects = todoist.projects.get()
   const todoistSections = todoist.sections.get()
   const todoistTasks = todoist.items.get()
   const todoistLabels = todoist.labels.get()

   // We add a label to a todo under the project to indicate that it's the project name
   // this is because there isn't as much freedom in naming a project as there in in naming a file
   // @ts-ignore
   const PROJECT_NAME_LABEL = todoistLabels.find(
      (l) => l.name === 'project-name',
   ).id
   // @ts-ignore
   const SECTION_NAME_LABEL = todoistLabels.find(
      (l) => l.name === 'section-name',
   ).id

   // Take a note, return it's todoist project
   const getTodoistProjectFromNote = (note) => {
      const projectLabelTask = todoistTasks.find(
         (t) => t.labels.includes(PROJECT_NAME_LABEL) && t.content === note.label,
      )
      if (!projectLabelTask) return null

      const project = todoistProjects.find(
         (p) => p.id === projectLabelTask.project_id,
      )

      return project || null
   }

   const getTodoistSectionFromHeader = (project, header) => {
      const sectionLabelTask = todoistTasks.find(
         (t) => t.project_id === project.id
        && t.labels.includes(SECTION_NAME_LABEL)
        && t.content === header,
      )
      if (!sectionLabelTask) return null

      const section = todoistSections.find(
         (p) => p.id === sectionLabelTask.section_id,
      )

      return section || null
   }

   const notes = getNotes()

   for (const note of notes) {
   // for (const note of [notes[1]]) {
      if (!note.isGoingConcern) continue

      log(`syncing note as going concern "${note.fileName}"`)

      // create project for note if it doesn't exist
      let project
      const existingProject = getTodoistProjectFromNote(note)
      if (!existingProject) {
         log(`creating project "${note.label}"`)

         project = await todoist.projects.add({
            name: note.label,
            parent_id: NOTE_PROJECT_ID,
         })

         await todoist.items.add({
            labels: [PROJECT_NAME_LABEL],
            content: note.label,
            // @ts-ignore
            project_id: project.id,
         })
      } else {
         project = existingProject
      }

      // create sections for it's headers if they don't exist
      for (const header of note.headers) {
         const existingSection = getTodoistSectionFromHeader(project, header)
         if (!existingSection) {
            // @ts-ignore
            const { id } = await todoist.sections.add({
               name: header,
               // @ts-ignore
               project_id: project.id,
            })

            log(`creating section "${header}"`)
            await todoist.items.add({
               labels: [SECTION_NAME_LABEL],
               content: header,
               // @ts-ignore
               project_id: project.id,
               section_id: id,
            })
         }
      }
   }

   // trim projects and sections that have been removed from sys3
   for (const project of todoistProjects) {
      if (project.parent_id !== NOTE_PROJECT_ID) return

      const projectNameTask = todoistTasks.find(
         (t) => t.labels.includes(PROJECT_NAME_LABEL) && t.project_id === project.id,
      )
      if (!projectNameTask) {
         throw new Error(
            `Expected to find projectNote for project ${project.name} - ${project.id}`,
         )
      }

      // find note for project, if there's no note, then delete it
      const note = notes.find((n) => n.isGoingConcern && n.label === projectNameTask.content)
      if (!note) {
         const hasTodos = !!todoistTasks.find(
            (t) => t.project_id === project.id
            && !t.labels.includes(PROJECT_NAME_LABEL)
            && !t.labels.includes(SECTION_NAME_LABEL),
         )
         if (hasTodos) {
            log(
               `would delete project "${project.name}" but it has todos... your time will come 😑`,
            )
            continue
         } else {
            log('deleting project', project.name)
            await todoist.projects.delete({ id: project.id })
         }
      }

      // if project will stay, check it's sections
      const sections = todoistSections.filter(
         (s) => s.project_id === projectNameTask.project_id,
      )

      for (const section of sections) {
         const sectionNameTask = todoistTasks.find(
            (t) => t.labels.includes(SECTION_NAME_LABEL) && t.section_id === section.id,
         )
         if (!sectionNameTask) {
            throw new Error(
               `Expected to find sectionNote for section ${section.name} - ${section.id}`,
            )
         }

         const hasTodos = !!todoistTasks.find(
            (t) => t.section_id === section.id
            && !t.labels.includes(PROJECT_NAME_LABEL)
            && !t.labels.includes(SECTION_NAME_LABEL),
         )
         if (hasTodos) {
            log(
               `would delete section "${section.name}" but it has todos... your time will come 😑`,
            )
         } else {
            log('deleting section', section.name)
            await todoist.sections.delete({ id: section.id })
         }
      }
   }
}

module.exports = { syncScratches, syncNotesAndHeaders }
