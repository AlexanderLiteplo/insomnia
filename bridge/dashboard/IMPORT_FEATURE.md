# Project Import Feature

The Insomnia dashboard now includes a convenient "Import" button in the Projects section that allows you to add existing projects from your local filesystem to the orchestrator system.

## How to Use

1. **Navigate to the Dashboard**
   - Open http://localhost:3333 in your browser
   - Look for the "Projects" section on the right side of the architecture diagram

2. **Click the Import Button**
   - Click the "+ Import" button at the top of the Projects section
   - A modal dialog will open

3. **Select Your Project**
   - **Browse button**: Click to select a directory
     - Modern browsers: Uses the File System Access API for directory selection
     - Fallback: Enter the full path manually
   - **Project Name**: Automatically extracted from the folder name, but can be customized

4. **Import the Project**
   - Click the "Import" button
   - The system will:
     - Validate that the folder exists
     - Create a project directory in `~/claude-automation-system/orchestrator/projects/{project-name}/`
     - Generate an initial `tasks.json` file
     - Add the project to the registry at `~/claude-automation-system/orchestrator/projects.json`
     - Display the project in the dashboard

## What Gets Created

When you import a project, the system creates:

### Project Directory Structure
```
~/claude-automation-system/orchestrator/projects/{project-name}/
├── tasks.json              # Main project definition
└── .analyze-project.sh     # Helper script for analysis
```

### Initial tasks.json
The system generates a starter `tasks.json` file with:
- Project metadata (name, description, outputDir)
- Initial analysis task that will:
  - Explore the codebase structure
  - Identify tech stack and dependencies
  - Determine project purpose
  - Create additional tasks as needed

Example:
```json
{
  "project": {
    "name": "my-project",
    "description": "Project imported from /path/to/project. Analysis pending.",
    "outputDir": "/path/to/project"
  },
  "tasks": [
    {
      "id": "task-001",
      "name": "Analyze and set up project structure",
      "description": "Analyze the codebase, understand its purpose, and create a comprehensive project plan",
      "requirements": [
        "Explore the project directory and understand file structure",
        "Identify the tech stack (languages, frameworks, dependencies)",
        "Determine the project's main purpose and functionality",
        "Check for existing tests, build scripts, and documentation",
        "Create a detailed project description",
        "Define additional tasks needed to complete or enhance the project"
      ],
      "testCommand": "echo \"Manual analysis required\"",
      "status": "pending",
      "testsPassing": false,
      "workerNotes": "This is an imported project. Worker should explore the codebase thoroughly before proceeding.",
      "managerReview": ""
    }
  ]
}
```

### Registry Entry
The project is registered in `~/claude-automation-system/orchestrator/projects.json`:
```json
{
  "projects": [
    {
      "name": "my-project",
      "tasksFile": "/full/path/to/orchestrator/projects/my-project/tasks.json",
      "addedAt": "2026-01-30T12:00:00.000Z"
    }
  ]
}
```

## What Happens Next

1. **Immediate Display**: The project appears in the dashboard's Projects section
2. **Manual Enhancement**: You can edit the `tasks.json` file to add specific tasks
3. **Orchestrator Processing**: Start the orchestrator to work on the project:
   ```bash
   cd ~/claude-automation-system/orchestrator
   ./scripts/projects.sh start "my-project"
   ./scripts/orchestrator.sh start
   ```

## Technical Details

### API Endpoint
- **Path**: `/api/projects/import`
- **Method**: POST
- **Authentication**: Requires CSRF token (automatically handled by the UI)
- **Request Body**:
  ```json
  {
    "folderPath": "/absolute/path/to/project",
    "projectName": "project-name"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "message": "Project 'project-name' imported successfully",
    "projectDir": "/path/to/orchestrator/projects/project-name",
    "tasksFile": "/path/to/orchestrator/projects/project-name/tasks.json"
  }
  ```

### Files Modified
- **Frontend**: `components/diagram/ArchitectureTree.tsx`
  - Added `ImportProjectModal` component
  - Added "+ Import" button to Projects header
  - Handles CSRF token fetching and API calls

- **Backend**: `app/api/projects/import/route.ts`
  - Validates folder exists
  - Creates project directory structure
  - Generates initial tasks.json
  - Updates project registry
  - Returns success/error response

### Security
- CSRF protection for POST requests
- Localhost-only access (or API key required)
- Path validation to prevent directory traversal
- Checks for existing projects to prevent overwrites

## Error Handling

Common errors and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| "Folder does not exist" | Invalid path | Check the path is absolute and exists |
| "Path is not a directory" | Path points to a file | Select a directory, not a file |
| "Project already exists" | Duplicate project name | Choose a different name or delete existing |
| "Failed to get CSRF token" | Dashboard not running | Ensure dashboard is running on port 3333 |

## Future Enhancements

Potential improvements:
- AI-powered project analysis to automatically generate meaningful tasks
- Import templates for common project types (Next.js, React, Node.js, etc.)
- Batch import for multiple projects
- Integration with git repositories (clone + import)
- Project categorization and tagging
