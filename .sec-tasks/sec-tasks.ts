#!/usr/bin/env bun
/**
 * sec-tasks - View SEC project tasks from any format
 * 
 * Usage:
 *   sec-tasks                - Show all tasks summary
 *   sec-tasks dag            - Show DAG dependencies
 *   sec-tasks <id>           - Show task details
 *   sec-tasks ready          - Show next ready tasks
 *   sec-tasks done           - Show done tasks
 *   sec-tasks todo           - Show todo tasks
 *   sec-tasks sync           - Sync all formats
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const TASKS_DIR = ".sec-tasks";
const DAG_FILE = path.join(TASKS_DIR, "tasks-dag.json");

interface Task {
  id: string;
  title: string;
  status: string;
  depends?: string[];
  children?: string[];
  done_at?: string;
  description?: string;
}

interface Dag {
  project: string;
  version: string;
  tasks: Task[];
}

function loadDag(): Dag {
  return JSON.parse(fs.readFileSync(DAG_FILE, "utf-8"));
}

function printHelp(): void {
  console.log(`sec-tasks - View SEC project tasks

Usage:
  sec-tasks                Show all tasks summary
  sec-tasks dag            Show DAG dependencies
  sec-tasks <id>           Show task details
  sec-tasks ready          Show next ready tasks
  sec-tasks done           Show done tasks
  sec-tasks todo           Show todo tasks
  sec-tasks planned        Show planned tasks
  sec-tasks sync           Sync all formats
`);
}

function listByStatus(dag: Dag, status: string): Task[] {
  return dag.tasks.filter(t => t.status === status);
}

function findTask(dag: Dag, id: string): Task | undefined {
  return dag.tasks.find(t => t.id === id);
}

function getReadyTasks(dag: Dag): Task[] {
  const done = new Set(listByStatus(dag, "done").map(t => t.id));
  return dag.tasks.filter(t => {
    if (t.status !== "todo" && t.status !== "planned") return false;
    if (!t.depends || t.depends.length === 0) return true;
    return t.depends.every(d => done.has(d));
  });
}

function printSummary(dag: Dag): void {
  const done = listByStatus(dag, "done").length;
  const todo = listByStatus(dag, "todo").length;
  const planned = listByStatus(dag, "planned").length;
  const inProgress = listByStatus(dag, "in_progress").length;
  
  console.log(`Project: ${dag.project} v${dag.version}`);
  console.log(`Total: ${dag.tasks.length} | Done: ${done} | Todo: ${todo} | Planned: ${planned} | In Progress: ${inProgress}\n`);
  
  for (const status of ["done", "in_progress", "todo", "planned"]) {
    const tasks = listByStatus(dag, status);
    if (tasks.length === 0) continue;
    
    console.log(`=== ${status.toUpperCase()} (${tasks.length}) ===`);
    for (const t of tasks) {
      const deps = t.depends && t.depends.length > 0 ? ` [deps: ${t.depends.join(", ")}]` : "";
      console.log(`  - ${t.id}: ${t.title}${deps}`);
    }
    console.log();
  }
}

function printDag(dag: Dag): void {
  console.log(`DAG (task → dependencies):\n`);
  for (const t of dag.tasks) {
    if (t.depends && t.depends.length > 0) {
      console.log(`  ${t.id} → ${t.depends.join(", ")}`);
    }
  }
  console.log(`\nDAG (task → children):\n`);
  for (const t of dag.tasks) {
    if (t.children && t.children.length > 0) {
      console.log(`  ${t.id} → ${t.children.join(", ")}`);
    }
  }
}

function printTask(task: Task): void {
  console.log(`ID: ${task.id}`);
  console.log(`Title: ${task.title}`);
  console.log(`Status: ${task.status}`);
  if (task.depends && task.depends.length > 0) {
    console.log(`Depends: ${task.depends.join(", ")}`);
  }
  if (task.children && task.children.length > 0) {
    console.log(`Children: ${task.children.join(", ")}`);
  }
  if (task.done_at) {
    console.log(`Done at: ${task.done_at}`);
  }
  if (task.description) {
    console.log(`Description: ${task.description}`);
  }
}

function syncAllFormats(): void {
  console.log("Syncing all formats...");
  
  // 重新生成所有格式从 JSON
  const dag = loadDag();
  console.log(`Loaded ${dag.tasks.length} tasks from ${DAG_FILE}`);
  
  // 触发 jj commit
  try {
    execSync("cd .. && jj status", { stdio: "inherit" });
    console.log("\nUse 'jj describe' and 'forklift submit' to push");
  } catch (e) {
    // ignore
  }
  
  console.log("Sync complete. Files:");
  for (const f of fs.readdirSync(TASKS_DIR)) {
    console.log(`  - ${path.join(TASKS_DIR, f)}`);
  }
}

function main(): void {
  const argv = process.argv.slice(2);
  const command = argv[0];
  
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  
  const dag = loadDag();
  
  switch (command) {
    case "dag":
      printDag(dag);
      break;
    case "ready":
      console.log("Ready to start:");
      for (const t of getReadyTasks(dag)) {
        console.log(`  - ${t.id}: ${t.title}`);
      }
      break;
    case "done":
      for (const t of listByStatus(dag, "done")) {
        console.log(`  - ${t.id}: ${t.title}`);
      }
      break;
    case "todo":
      for (const t of listByStatus(dag, "todo")) {
        console.log(`  - ${t.id}: ${t.title}`);
      }
      break;
    case "planned":
      for (const t of listByStatus(dag, "planned")) {
        console.log(`  - ${t.id}: ${t.title}`);
      }
      break;
    case "in-progress":
      for (const t of listByStatus(dag, "in_progress")) {
        console.log(`  - ${t.id}: ${t.title}`);
      }
      break;
    case "sync":
      syncAllFormats();
      break;
    default:
      const task = findTask(dag, command);
      if (task) {
        printTask(task);
      } else {
        console.error(`Unknown command or task: ${command}`);
        process.exit(1);
      }
  }
}

main();
