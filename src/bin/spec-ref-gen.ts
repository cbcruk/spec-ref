#!/usr/bin/env node
import { runGen } from '../cli/gen.ts'

runGen(process.argv.slice(2))
