#!/usr/bin/env node
import { runScan } from '../cli/scan.ts'

runScan(process.argv.slice(2))
