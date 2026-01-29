#!/usr/bin/env node
import {
  getAllTasks,
  getPendingTasks,
  createTask,
  updateTask,
  deleteTask,
  HumanTask,
} from './human-tasks';

function printUsage() {
  console.log(`
Human Tasks CLI

Usage: node dist/human-tasks-cli.js <command> [options]

Commands:
  list                    Show all pending tasks
  all                     Show all tasks (including completed)
  add <title> <desc>      Add a new task
  complete <id>           Mark task as completed
  dismiss <id>            Dismiss a task
  delete <id>             Delete a task
  help                    Show this help

Options for 'add':
  --priority <level>      Set priority: low, medium, high, urgent (default: medium)
  --project <name>        Associate with a project
  --instruction <text>    Add an instruction step (can be used multiple times)
  --no-notify             Don't send iMessage notification

Examples:
  node dist/human-tasks-cli.js add "Deploy to production" "Push the latest changes to prod" --priority high --project myapp
  node dist/human-tasks-cli.js add "Review PR" "Check PR #123" --instruction "Review code changes" --instruction "Test locally" --instruction "Approve or request changes"
  node dist/human-tasks-cli.js complete htask_1234567890
`);
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString();
}

function formatTask(task: HumanTask, verbose = false): string {
  const priorityColors: Record<string, string> = {
    low: '\x1b[90m',      // gray
    medium: '\x1b[0m',    // default
    high: '\x1b[33m',     // yellow
    urgent: '\x1b[31m',   // red
  };
  const reset = '\x1b[0m';
  const color = priorityColors[task.priority] || '';

  const statusIcons: Record<string, string> = {
    pending: '○',
    in_progress: '◐',
    completed: '✓',
    dismissed: '✗',
  };

  let output = `${color}${statusIcons[task.status]} [${task.priority.toUpperCase()}] ${task.title}${reset}\n`;
  output += `  ID: ${task.id}\n`;
  output += `  ${task.description}\n`;

  if (task.project) {
    output += `  Project: ${task.project}\n`;
  }

  if (verbose && task.instructions.length > 0) {
    output += `  Instructions:\n`;
    task.instructions.forEach((instr, i) => {
      output += `    ${i + 1}. ${instr}\n`;
    });
  }

  output += `  Created: ${formatDate(task.createdAt)}`;
  if (task.completedAt) {
    output += ` | Completed: ${formatDate(task.completedAt)}`;
  }

  return output;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  switch (command) {
    case 'list': {
      const tasks = getPendingTasks();
      if (tasks.length === 0) {
        console.log('\n✨ No pending tasks\n');
      } else {
        console.log(`\n=== Pending Human Tasks (${tasks.length}) ===\n`);
        tasks.forEach(task => {
          console.log(formatTask(task, true));
          console.log('');
        });
      }
      break;
    }

    case 'all': {
      const tasks = getAllTasks();
      if (tasks.length === 0) {
        console.log('\n✨ No tasks\n');
      } else {
        console.log(`\n=== All Human Tasks (${tasks.length}) ===\n`);
        tasks.forEach(task => {
          console.log(formatTask(task));
          console.log('');
        });
      }
      break;
    }

    case 'add': {
      if (args.length < 3) {
        console.log('Usage: add <title> <description> [options]');
        process.exit(1);
      }

      const title = args[1];
      const description = args[2];

      let priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium';
      let project: string | undefined;
      let instructions: string[] = [];
      let notify = true;

      for (let i = 3; i < args.length; i++) {
        if (args[i] === '--priority' && args[i + 1]) {
          priority = args[++i] as any;
        } else if (args[i] === '--project' && args[i + 1]) {
          project = args[++i];
        } else if (args[i] === '--instruction' && args[i + 1]) {
          instructions.push(args[++i]);
        } else if (args[i] === '--no-notify') {
          notify = false;
        }
      }

      const task = await createTask(title, description, {
        priority,
        project,
        instructions,
        notify,
        createdBy: 'cli',
      });

      console.log(`\n✅ Created task: ${task.id}\n`);
      console.log(formatTask(task, true));
      break;
    }

    case 'complete': {
      const id = args[1];
      if (!id) {
        console.log('Usage: complete <task-id>');
        process.exit(1);
      }

      const task = updateTask(id, { status: 'completed' });
      if (task) {
        console.log(`\n✅ Marked as completed: ${task.title}\n`);
      } else {
        console.log(`\n❌ Task not found: ${id}\n`);
      }
      break;
    }

    case 'dismiss': {
      const id = args[1];
      if (!id) {
        console.log('Usage: dismiss <task-id>');
        process.exit(1);
      }

      const task = updateTask(id, { status: 'dismissed' });
      if (task) {
        console.log(`\n✗ Dismissed: ${task.title}\n`);
      } else {
        console.log(`\n❌ Task not found: ${id}\n`);
      }
      break;
    }

    case 'delete': {
      const id = args[1];
      if (!id) {
        console.log('Usage: delete <task-id>');
        process.exit(1);
      }

      if (deleteTask(id)) {
        console.log(`\n🗑️ Deleted task: ${id}\n`);
      } else {
        console.log(`\n❌ Task not found: ${id}\n`);
      }
      break;
    }

    case 'help':
    default:
      printUsage();
      break;
  }
}

main().catch(console.error);
