-- ---------------------------------------------------------------------------
-- 0185: five new games, and games last a day.
--
--   1. hangman, emoji_riddle, scramble, minesweeper and higher_lower join
--      the allowed game kinds (sessions and the leaderboard).
--   2. Games still open now get the new 24-hour limit counted from when they
--      were created (new games are given it by the app). After that, and as
--      soon as everyone who joined has finished, a game is closed: its
--      results stay viewable but nobody can join or play.
-- ---------------------------------------------------------------------------

alter table public.activity_sessions drop constraint if exists activity_sessions_kind_check;
alter table public.activity_sessions add constraint activity_sessions_kind_check check (kind in (
  'wordle', 'eight_ball', 'trivia', 'would_you_rather', 'four_in_row', 'reversi',
  'hangman', 'emoji_riddle', 'scramble', 'minesweeper', 'higher_lower'
));

alter table public.activity_scores drop constraint if exists activity_scores_kind_check;
alter table public.activity_scores add constraint activity_scores_kind_check check (kind in (
  'wordle', 'eight_ball', 'trivia', 'would_you_rather', 'four_in_row', 'reversi',
  'hangman', 'emoji_riddle', 'scramble', 'minesweeper', 'higher_lower'
));

update public.activity_sessions
   set expires_at = least(expires_at, created_at + interval '24 hours')
 where status = 'open';
