#!/usr/bin/env node

/**
 * Removes all files from a target directory. Intended as a pre-build  step so
 * publish commands that glob the directory only pick up the freshly built
 * package.
 *
 * Usage:
 *   node scripts/clean-vsix.js [dir]
 *
 * If [dir] is omitted, defaults to "vsix/" relative to cwd.
 */

import { DirectoryObject } from "@gesslar/toolkit"

const input = process.argv[2] || "vsix"
const target = new DirectoryObject(input)

try {
  if(await target.exists) {
    const rmdir = async d => {
      const {files, directories} = await d.read()

      for(const file of files)
        await file.delete()

      for(const directory of directories)
        await directory.delete()

      await d.delete()
    }

    await rmdir(target)
  }

  await target.assureExists()
} catch(e) {
  console.error(e.message)
  process.exit(1)
}
