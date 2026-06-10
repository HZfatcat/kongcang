-- =============================================================
-- 修复业务记录表 UdescBusinessNote 的 ID 前缀问题
-- 旧版同步未给 call/ticket 来源的笔记加前缀，导致前端误分类为 IM
-- 
-- 使用方式:
--   1. 先备份: CREATE TABLE "UdescBusinessNote_bak" AS SELECT * FROM "UdescBusinessNote";
--   2. 运行本脚本
--   3. 重新同步数据后，旧无前缀记录会被 sync 中的清理逻辑自动删除
-- =============================================================

-- 第一步：为通话相关的业务记录加上 note_call_ 前缀
-- 判断依据：record 的 rawPayload 中不包含 ticket 相关字段，且 customerNickName 是电话号码
UPDATE "UdescBusinessNote"
SET id = 'note_call_' || id
WHERE id NOT LIKE 'note\_%' AND id NOT LIKE 'call\_%' AND id NOT LIKE 'ticket\_%'
  AND "customerNickName" ~ '^\d{7,}$';

-- 第二步：为工单相关的业务记录加上 note_ticket_ 前缀
-- 判断依据：record 关联了工单数据（problemType1/2/3 有值且不是电话号码）
-- 注意：这里只修改那些 ID 没有前缀的记录
UPDATE "UdescBusinessNote"
SET id = 'note_ticket_' || id
WHERE id NOT LIKE 'note\_%' AND id NOT LIKE 'call\_%' AND id NOT LIKE 'ticket\_%'
  AND ("problemType1" IS NOT NULL AND "problemType1" != '')
  AND ("customerNickName" IS NULL OR "customerNickName" = '' OR "customerNickName" !~ '^\d{7,}$');

-- 第三步：剩余的未加前缀记录都视为 IM 来源
UPDATE "UdescBusinessNote"
SET id = 'note_im_' || id
WHERE id NOT LIKE 'note\_%' AND id NOT LIKE 'call\_%' AND id NOT LIKE 'ticket\_%';

-- 第四步：删除二级/三级分类被错误填充为工单 priority/subject 的数据
-- 原 bug：ticketPt2 = ticket.priority, ticketPt3 = ticket.subject
-- 修复后：仅保留从 rawPayload 级联解析出的正确分类
-- 需要手动判断哪些记录有问题，以下仅作为参考

-- 查看修复后的来源统计
SELECT 
  CASE 
    WHEN id LIKE 'note\_im\_%' THEN 'im'
    WHEN id LIKE 'note\_call\_%' OR id LIKE 'call\_%' THEN 'call'
    WHEN id LIKE 'note\_ticket\_%' OR id LIKE 'ticket\_%' THEN 'ticket'
    ELSE 'unknown'
  END as source,
  COUNT(*) as cnt
FROM "UdescBusinessNote"
GROUP BY source
ORDER BY cnt DESC;
