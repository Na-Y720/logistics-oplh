alter table public.logistics_board_assignments
 drop constraint board_am_place,
 drop constraint board_pm_place,
 add constraint board_am_place check(am is null or am in ('A','B','C','D','E','F','G','H','I','J','梱包','パスソート','配送佐川','配送南郵便局','未配置','休憩 11:30','休憩 12:00','休憩 12:30','応援','補充','予備','欠勤')),
 add constraint board_pm_place check(pm is null or pm in ('A','B','C','D','E','F','G','H','I','J','梱包','パスソート','配送佐川','配送南郵便局','未配置','休憩 11:30','休憩 12:00','休憩 12:30','応援','補充','予備','欠勤'));
