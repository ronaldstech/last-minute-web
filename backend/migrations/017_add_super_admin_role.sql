-- Separate privileged account actions from ordinary administrator access.
-- Promote the earliest existing admin as the initial super administrator.
UPDATE users
SET role = 'super_admin'
WHERE role = 'admin'
ORDER BY id ASC
LIMIT 1;
