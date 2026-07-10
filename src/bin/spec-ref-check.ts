#!/usr/bin/env node
import { runCheckGen } from '../cli/gen-check.ts'

runCheckGen(process.argv.slice(2))
