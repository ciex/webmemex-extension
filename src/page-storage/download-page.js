import get from 'lodash/fp/get'

import db from 'src/pouchdb'
import { getTimestamp } from 'src/activity-logger'
import { getAllPages } from 'src/search/find-pages'

export async function downloadAllPages({folder} = {}) {
    const pagesResult = await getAllPages()
    if (folder === undefined) {
        folder = `WebMemex snapshots dump ${new Date().toISOString().substring(0, 10)}`
    }
    const failedDownloads = []
    for (const i in pagesResult.rows) {
        const page = pagesResult.rows[i].doc

        // Check if it has a stored page attached at all.
        if (!get(['_attachments', 'frozen-page.html'])(page)) {
            return undefined
        }

        try {
            await downloadPage({page, folder})
        } catch (error) {
            failedDownloads.push({page, error})
        }
    }
    if (failedDownloads) {
        const errorMessages = failedDownloads.map(({page, error}) =>
            `${page._id} ("${page.title}"): ${error.message}\n`
        )
        throw new Error(`Some downloads failed:\n${errorMessages}`)
    }
}

export async function downloadPage({page, folder, filename, saveAs=false}) {
    const pageId = page._id
    // Read the html file from the database.
    const blob = await db.getAttachment(pageId, 'frozen-page.html')
    const url = URL.createObjectURL(blob)

    if (filename === undefined) {
        // Use title as filename, after removing (back)slashes.
        const date = new Date(getTimestamp(page)).toISOString().substring(0, 10)
        filename = `${date} - ${page.title.replace(/[\\/]/g, '-')}.html`
    }
    if (folder !== undefined) {
        filename = [folder, filename].join('/')
    }

    const tryDownload = filename => browser.downloads.download({
        url,
        filename,
        saveAs,
        conflictAction: 'uniquify',
    })
    try {
        await tryDownload(filename)
    } catch (err) {
        // Possibly due to punctuation in the filename (Chromium is picky).
        if (err.message.includes('filename')) {
            filename = filename.replace(/['?:~<>*|]/g, '-') // an empirically composed list.
            await tryDownload(filename)
        }
    }
    // Forget the blob again. Firefox needs a moment; we give it 10s to be on the safe side.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000*10)
}
