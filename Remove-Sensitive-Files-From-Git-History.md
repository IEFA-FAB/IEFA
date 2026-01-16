# How to Remove Sensitive Files from Git History

> [!WARNING]
> This procedure rewrites Git history. All commits after the file's introduction will have new commit hashes. Coordinate with your team before proceeding.

## Overview

This guide explains how to completely remove a sensitive file from your Git repository history using `git filter-branch`. This is useful when you accidentally commit files containing passwords, API keys, database dumps, or other confidential information.

## Prerequisites

- Git installed (version 2.0+)
- Admin/write access to the remote repository
- Clean working directory (commit or stash any pending changes)
- Backup of your repository (optional but recommended)

## Step-by-Step Process

### 1. Pre-flight Checks

Before starting, verify your repository state:

```bash
# Check repository status
git status

# Identify commits containing the sensitive file
git log --all --oneline -- path/to/sensitive/file.ext

# Verify the file exists in specific commits
git show <commit-hash>:path/to/sensitive/file.ext
```

### 2. Rewrite Git History

Use `git filter-branch` to remove the file from all commits:

```bash
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch path/to/sensitive/file.ext' \
  --prune-empty --tag-name-filter cat -- --all
```

**Command breakdown:**
- `--force`: Overwrites existing backup refs (use with caution)
- `--index-filter`: Operates on the Git index (faster than `--tree-filter`)
- `git rm --cached --ignore-unmatch`: Removes file from index, doesn't error if not found
- `--prune-empty`: Removes commits that become empty after filtering
- `--tag-name-filter cat`: Rewrites tags to point to new commit hashes
- `-- --all`: Applies to all branches and tags

### 3. Clean Up Backup References

After rewriting history, remove backup refs created by `filter-branch`:

```bash
# Remove original refs
git for-each-ref --format="%(refname)" refs/original/ | \
  xargs -n 1 git update-ref -d

# Expire reflog entries
git reflog expire --expire=now --all

# Aggressive garbage collection
git gc --prune=now --aggressive
```

This ensures the sensitive file is completely removed from your local `.git` database.

### 4. Verify Local Removal

Confirm the file has been removed from history:

```bash
# Should return nothing
git log --all --full-history -- path/to/sensitive/file.ext

# Verify file doesn't exist in working directory
ls -la path/to/sensitive/file.ext
```

### 5. Force Push to Remote

Push the rewritten history to your remote repository:

```bash
# Push all branches
git push origin --force --all

# Push all tags
git push origin --force --tags
```

> [!CAUTION]
> This will overwrite the remote repository history. Ensure all team members are aware.

### 6. Verify Remote Removal

Check the remote repository:

1. Navigate to the file URL on GitHub/GitLab:
   - Example: `https://github.com/user/repo/blob/main/path/to/file.ext`
   - Should return **404 Not Found**

2. Search the repository for the filename:
   - Should return **0 results**

3. Check the original commit (if you have the hash):
   - Will show: *"This commit does not belong to any branch"*

## Team Coordination

After force-pushing, team members must update their local repositories:

### Option 1: Reset Local Branch
```bash
# Backup local changes
git stash

# Fetch new history
git fetch origin

# Reset to match remote (replace 'main' with your branch name)
git reset --hard origin/main

# Restore local changes
git stash pop
```

### Option 2: Re-clone Repository
```bash
# Backup uncommitted work if needed
cd ..
git clone https://github.com/user/repo.git repo-new
cd repo-new
```

## Important Considerations

### GitHub/GitLab Caching

Even after successful removal, the commit may remain accessible via direct link (if you have the commit hash) for a limited time:

- **GitHub**: Orphaned commits are cached temporarily and will be garbage collected automatically (typically within a few weeks)
- **Critical Data**: If the data is highly sensitive (passwords, PII), contact support to request immediate garbage collection

### What Gets Rewritten

- All commit hashes after the file's introduction
- All tags pointing to affected commits
- All branches containing affected commits

### What Doesn't Change

- Repository structure
- File content (except the removed file)
- Commit messages
- Author information

## Alternative Tools

### git-filter-repo (Recommended Modern Tool)

If you have Python and pip installed:

```bash
# Install
pip install git-filter-repo

# Remove file
git filter-repo --path path/to/sensitive/file.ext --invert-paths --force
```

**Advantages:**
- Faster than `filter-branch`
- More reliable
- Better error handling
- Officially recommended by Git project

### BFG Repo-Cleaner

For removing files by pattern or size:

```bash
# Download BFG
wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar

# Remove file
java -jar bfg-1.14.0.jar --delete-files filename.ext /path/to/repo

# Clean up
cd /path/to/repo
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

## Troubleshooting

### Error: "Cannot rewrite branch(es) with a dirty working directory"

**Solution:**
```bash
git status
git add .
git commit -m "Save work in progress"
# Or: git stash
```

### Error: "Ref 'refs/heads/branch' is at ... but expected ..."

**Solution:**
```bash
# Someone pushed to remote during your rewrite
git fetch origin
# Restart the process
```

### File still visible after force push

**Possible causes:**
1. File wasn't pushed to all branches
2. GitHub cache (will be cleared automatically)
3. Forks of your repository still contain the file

**Solution:**
```bash
# Verify all remotes were updated
git remote -v
git push <remote> --force --all
git push <remote> --force --tags
```

## Prevention Best Practices

1. **Use `.gitignore`**: Add sensitive file patterns before committing
   ```
   # .gitignore
   *.sql
   *.env
   secrets/
   config/credentials.yml
   ```

2. **Pre-commit Hooks**: Install tools to scan for secrets
   ```bash
   # Example: git-secrets
   git secrets --install
   git secrets --register-aws
   ```

3. **Secret Management**: Use environment variables or secret management tools
   - AWS Secrets Manager
   - HashiCorp Vault
   - Doppler
   - 1Password for Developers

4. **Code Review**: Always review changes before pushing

## Related Commands

```bash
# Find large files in history
git rev-list --objects --all | \
  git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | \
  sed -n 's/^blob //p' | \
  sort --numeric-sort --key=2 | \
  tail -n 10

# List all files that ever existed in the repository
git log --pretty=format: --name-only --diff-filter=A | \
  sort -u

# Count commits per file
git log --all --format='format:' --name-only | \
  grep -v '^$' | sort | uniq -c | sort -rn
```

## Summary Checklist

- [ ] Verify working directory is clean
- [ ] Identify sensitive file path and affected commits
- [ ] Run `git filter-branch` to rewrite history
- [ ] Clean up backup refs and garbage collect
- [ ] Verify local removal
- [ ] Force push to remote (all branches and tags)
- [ ] Verify remote removal
- [ ] Notify team members to update their local clones
- [ ] Update `.gitignore` to prevent future accidents
- [ ] (Optional) Contact platform support for immediate cache purge

## References

- [Git Filter-Branch Documentation](https://git-scm.com/docs/git-filter-branch)
- [GitHub: Removing Sensitive Data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [git-filter-repo Tool](https://github.com/newren/git-filter-repo)
- [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/)

---

**Last Updated:** 2026-01-15  
**Git Version:** 2.0+  
**Tested On:** Linux, macOS, Windows (Git Bash)
