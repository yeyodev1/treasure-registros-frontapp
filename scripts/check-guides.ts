/**
 * Revisa las guías paso a paso contra las definiciones del backend:
 *   node scripts/check-guides.ts [../treasure-backapp] [R-09 R-23 …]
 */
import fs from 'node:fs'
import path from 'node:path'
import { checkGuide, type FillGuide } from '../src/utils/fillGuide.ts'

const back = process.argv[2] && !process.argv[2].startsWith('R-') ? process.argv[2] : '../treasure-backapp'
const only = process.argv.slice(2).filter((a) => a.startsWith('R-'))
const dir = path.resolve('src/guides')
let bad = 0
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const code = file.replace('.json', '')
  if (only.length && !only.includes(code)) continue
  const guide = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as FillGuide
  const form = JSON.parse(fs.readFileSync(path.join(back, 'assets/ism/defs', file), 'utf8'))
  const errors = checkGuide(guide, form)
  if (errors.length) bad++
  console.log(errors.length ? `FALLA ${code}\n  ${errors.join('\n  ')}` : `OK    ${code}`)
}
process.exit(bad ? 1 : 0)
