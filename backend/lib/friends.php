<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' && !defined('NOTELY_INTERNAL')) {
    http_response_code(403);
    exit;
}

const FRIEND_ROUTES = ['friends', 'friend-request', 'friend-respond', 'friend-remove'];
const FRIEND_NOT_FOUND = 'This friend request could not be found.';
const FRIEND_DAILY_REQUESTS = 30;

// Everyone the student is connected to, split into accepted friends and pending requests each way.
function friendLists(PDO $db, string $userId): array
{
    $rows = query($db, 'SELECT f.id, f.status, f.requester_id, u.id AS user_id, u.name, u.email
        FROM notely_friendships f
        JOIN notely_users u ON u.id = IF(f.requester_id = ?, f.addressee_id, f.requester_id)
        WHERE f.requester_id = ? OR f.addressee_id = ?
        ORDER BY u.name, f.id', [$userId, $userId, $userId])->fetchAll();
    $lists = ['friends' => [], 'incoming' => [], 'outgoing' => []];
    foreach ($rows as $row) {
        $list = $row['status'] === 'accepted' ? 'friends'
            : ((string) $row['requester_id'] === $userId ? 'outgoing' : 'incoming');
        $lists[$list][] = friendView($row);
    }
    return $lists;
}

function friendView(array $row): array
{
    return ['id' => (string) $row['id'], 'userId' => (string) $row['user_id'], 'name' => $row['name'], 'email' => $row['email']];
}

function friendAction(PDO $db, array $config, array $session, string $route, array $input): array
{
    if ($route === 'friends') {
        return friendLists($db, (string) requireUser($db, $session)['id']);
    }
    if ($route === 'friend-request') {
        // Counted outside the transaction so rejected lookups count too: this route reveals which emails are registered.
        rateLimit($db, $config, 'friend-request', (string) $session['user_id'], FRIEND_DAILY_REQUESTS, 86400,
            'You’ve sent a lot of friend requests today. Try again tomorrow.');
    }
    $db->beginTransaction();
    // Serialize with logout and account deletion, like the other account mutations.
    $me = (string) requireUser($db, $session, true)['id'];
    $status = 200;
    $request = null;
    if ($route === 'friend-request') {
        $email = validEmail(field($input, 'email'));
        $them = query($db, 'SELECT id, name, email FROM notely_users WHERE email = ?', [$email])->fetch();
        if (!$them) {
            throw new HttpError(404, 'No registered account was found for this email.');
        }
        $them['user_id'] = $them['id'];
        $theirs = (string) $them['id'];
        if ($theirs === $me) {
            throw new HttpError(422, 'You can’t add yourself as a friend.');
        }
        $pair = [min((int) $me, (int) $theirs), max((int) $me, (int) $theirs)];
        $row = query($db, 'SELECT * FROM notely_friendships WHERE user_low = ? AND user_high = ? FOR UPDATE', $pair)->fetch();
        if ($row && $row['status'] === 'accepted') {
            throw new HttpError(409, 'You’re already friends with this person.');
        }
        if ($row && (string) $row['requester_id'] === $me) {
            throw new HttpError(409, 'You already sent this person a friend request.');
        }
        if ($row) {
            // They already asked us: sending one back accepts theirs instead of duplicating it.
            query($db, "UPDATE notely_friendships SET status = 'accepted', responded_at = UTC_TIMESTAMP() WHERE id = ?", [$row['id']]);
            $them['id'] = $row['id'];
        } else {
            try {
                query($db, 'INSERT INTO notely_friendships (requester_id, addressee_id, user_low, user_high) VALUES (?, ?, ?, ?)',
                    [$me, $theirs, ...$pair]);
            } catch (PDOException $e) {
                // The other student's request landed between our read and this insert.
                if ($e->getCode() !== '23000') throw $e;
                throw new HttpError(409, 'You already sent this person a friend request.');
            }
            $them['id'] = $db->lastInsertId();
            $status = 201;
        }
        $request = friendView($them);
    } elseif ($route === 'friend-respond') {
        $accept = $input['accept'] ?? null;
        if (!is_bool($accept)) {
            throw new HttpError(422, 'Choose whether to accept this request.');
        }
        $id = recordId($input['id'] ?? null, FRIEND_NOT_FOUND);
        // Only the person who was asked can answer.
        $row = query($db, "SELECT id FROM notely_friendships WHERE id = ? AND addressee_id = ? AND status = 'pending' FOR UPDATE",
            [$id, $me])->fetch();
        if (!$row) {
            throw new HttpError(404, FRIEND_NOT_FOUND);
        }
        query($db, $accept ? "UPDATE notely_friendships SET status = 'accepted', responded_at = UTC_TIMESTAMP() WHERE id = ?"
            : 'DELETE FROM notely_friendships WHERE id = ?', [$id]);
    } else {
        $id = recordId($input['id'] ?? null, FRIEND_NOT_FOUND);
        $removed = query($db, "DELETE FROM notely_friendships WHERE id = ? AND status = 'accepted'
            AND (requester_id = ? OR addressee_id = ?)", [$id, $me, $me])->rowCount();
        if ($removed !== 1) {
            throw new HttpError(404, FRIEND_NOT_FOUND);
        }
    }
    $db->commit();
    http_response_code($status);
    return ($request ? ['request' => $request] : []) + friendLists($db, $me);
}
