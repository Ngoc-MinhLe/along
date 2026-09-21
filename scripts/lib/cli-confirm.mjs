import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

export async function confirmTrustedMutation(summary) {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error('Confirmation required: mutation is denied in a non-interactive terminal. Use --dry-run first.')
  }
  console.log(summary)
  const prompt = createInterface({ input: stdin, output: stdout })
  try {
    const answer = (await prompt.question('Proceed? (yes/no) ')).trim().toLowerCase()
    if (answer !== 'yes') throw new Error('Confirmation declined. No mutation was performed.')
  } finally {
    prompt.close()
  }
}
