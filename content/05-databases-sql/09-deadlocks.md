---
title: Deadlocks — почему возникают и как избежать?
level: middle
tags: [deadlock, взаимоблокировка, блокировки, lock ordering, retry, sql server, postgresql]
---

:::tldr
- **Deadlock** — две (или больше) транзакции **ждут друг друга по кругу**: T1 держит ресурс A и ждёт B, T2 держит B и ждёт A. Сами они никогда не завершатся.
- СУБД обнаруживает цикл ожидания (граф ожиданий) и **убивает одну из транзакций** («жертву»): SQL Server — ошибка **1205**, PostgreSQL — `deadlock detected` (SQLSTATE **40P01**). Остальные продолжают работу.
- Частые причины: **разный порядок** обновления строк/таблиц, **эскалация** блокировок (shared → exclusive при «прочитать, потом обновить»), отсутствие индексов (сканирование блокирует лишние строки), внешние ключи, длинные транзакции.
- Профилактика: **единый порядок** захвата ресурсов, **короткие** транзакции, правильные **индексы**, `UPDLOCK` / `FOR UPDATE` при чтении перед изменением, атомарные `UPDATE ... WHERE`, snapshot/MVCC-чтение.
- Лечение в коде: deadlock — **нормальная** ситуация под нагрузкой; транзакцию нужно **повторить** (retry с небольшой задержкой).
:::

## Как возникает

```mermaid Классический deadlock при переводах
sequenceDiagram
    participant T1 as T1: перевод 1 → 2
    participant A as Счёт 1
    participant B as Счёт 2
    participant T2 as T2: перевод 2 → 1
    T1->>A: UPDATE счёт 1 — X-блокировка
    T2->>B: UPDATE счёт 2 — X-блокировка
    T1->>B: UPDATE счёт 2 — ЖДЁТ T2
    T2->>A: UPDATE счёт 1 — ЖДЁТ T1
    Note over T1,T2: цикл ожидания — deadlock
    Note over T2: СУБД выбирает жертву: T2 откатывается (ошибка 1205 / 40P01)
    T1->>B: получает блокировку, продолжает, COMMIT
```

```mermaid Граф ожиданий содержит цикл
flowchart LR
    T1["Транзакция 1"] -- "ждёт ресурс,<br/>которым владеет" --> T2["Транзакция 2"]
    T2 -- "ждёт ресурс,<br/>которым владеет" --> T1
```

Детектор deadlock-ов периодически (в PostgreSQL — после `deadlock_timeout`, по умолчанию 1 с ожидания; в SQL Server — каждые ~5 с, чаще при обнаружениях) строит граф ожиданий и ищет циклы.

## Типичные сценарии

### 1. Разный порядок доступа

Перевод 1 → 2 и перевод 2 → 1 одновременно (пример выше). То же — с таблицами: один код обновляет `orders`, потом `stock`, другой — `stock`, потом `orders`.

**Решение — единый порядок**, например по возрастанию id:

```csharp
var (first, second) = fromId < toId ? (fromId, toId) : (toId, fromId);
await using var tx = await db.Database.BeginTransactionAsync(ct);
await db.Database.ExecuteSqlAsync($"SELECT id FROM accounts WHERE id IN ({first}, {second}) ORDER BY id FOR UPDATE", ct);
// теперь обе строки заблокированы в едином порядке — можно безопасно менять
```

### 2. Конверсия блокировок: прочитать, затем изменить

```mermaid Два читателя хотят стать писателями
sequenceDiagram
    participant T1 as T1
    participant R as Строка товара
    participant T2 as T2
    T1->>R: SELECT (S-блокировка при Repeatable Read / Serializable)
    T2->>R: SELECT (S-блокировка — совместима)
    T1->>R: UPDATE — нужна X, ждёт снятия S у T2
    T2->>R: UPDATE — нужна X, ждёт снятия S у T1
    Note over T1,T2: deadlock
```

**Решение**: сразу брать блокировку на изменение при чтении — `SELECT ... FOR UPDATE` (PostgreSQL), `WITH (UPDLOCK)` (SQL Server). Или вообще не читать: атомарный `UPDATE stock SET qty = qty - 1 WHERE id = @id AND qty > 0`.

### 3. Отсутствие индекса

`UPDATE orders SET status = 'x' WHERE customer_id = 5` без индекса по `customer_id` сканирует таблицу и (в блокировочных СУБД) блокирует гораздо больше строк/страниц, чем нужно, увеличивая шанс пересечения с другими транзакциями. Индексы на FK и на столбцы в `WHERE` изменений уменьшают «площадь» блокировок.

### 4. Внешние ключи и каскады

Вставка дочерней строки берёт разделяемую блокировку на родителя (проверка FK). Параллельное удаление/обновление родителя в другом порядке → deadlock. Каскадное удаление блокирует множество строк в разных таблицах.

### 5. Длинные транзакции

Чем дольше транзакция держит блокировки (HTTP-вызов внутри транзакции, пользовательский ввод), тем выше вероятность пересечения.

## Как расследовать

```sql
-- SQL Server: встроенная сессия Extended Events system_health хранит deadlock graph
SELECT xed.value('@timestamp', 'datetime2') AS time, xed.query('.') AS deadlock_graph
FROM (SELECT CAST(target_data AS xml) AS td
      FROM sys.dm_xe_session_targets t JOIN sys.dm_xe_sessions s ON s.address = t.event_session_address
      WHERE s.name = 'system_health' AND t.target_name = 'ring_buffer') x
CROSS APPLY td.nodes('RingBufferTarget/event[@name="xml_deadlock_report"]') AS q(xed);
```

```text PostgreSQL: сообщение в логе (log_lock_waits = on)
ERROR:  deadlock detected
DETAIL:  Process 4121 waits for ShareLock on transaction 9054; blocked by process 4135.
         Process 4135 waits for ShareLock on transaction 9053; blocked by process 4121.
         Process 4121: UPDATE accounts SET balance = balance + 500 WHERE id = 2
         Process 4135: UPDATE accounts SET balance = balance + 500 WHERE id = 1
```

Deadlock graph показывает участников, их запросы, удерживаемые и ожидаемые ресурсы — по нему восстанавливается порядок доступа.

## Retry в .NET

```csharp
// EF Core: встроенная стратегия повторяет транзиентные ошибки, включая deadlock
builder.Services.AddDbContext<ShopDbContext>(o => o.UseSqlServer(conn, sql => sql.EnableRetryOnFailure(
    maxRetryCount: 3, maxRetryDelay: TimeSpan.FromSeconds(2), errorNumbersToAdd: [1205])));

// Polly для произвольного кода (Dapper, ADO.NET)
var pipeline = new ResiliencePipelineBuilder()
    .AddRetry(new RetryStrategyOptions
    {
        ShouldHandle = new PredicateBuilder()
            .Handle<SqlException>(e => e.Number == 1205)
            .Handle<PostgresException>(e => e.SqlState == PostgresErrorCodes.DeadlockDetected),
        MaxRetryAttempts = 3,
        Delay = TimeSpan.FromMilliseconds(100),
        BackoffType = DelayBackoffType.Exponential,
        UseJitter = true
    })
    .Build();

await pipeline.ExecuteAsync(async ct => await TransferAsync(from, to, amount, ct), ct);
```

Повторять нужно **всю транзакцию** целиком (вместе с чтениями), а не только упавший оператор.

## Чек-лист профилактики

```mermaid Как снизить вероятность deadlock-ов
flowchart TD
    A["Единый порядок доступа<br/>к таблицам и строкам"]:::good
    B["Короткие транзакции:<br/>без I/O и ожиданий внутри"]:::good
    C["Индексы под WHERE изменений<br/>и на внешних ключах"]:::good
    D["FOR UPDATE / UPDLOCK<br/>при чтении перед изменением"]:::good
    E["Атомарные UPDATE вместо<br/>прочитать → изменить"]:::good
    F["MVCC-чтение: RCSI / snapshot —<br/>читатели не блокируют писателей"]:::good
    G["Retry транзакции<br/>при 1205 / 40P01"]:::accent
    A ~~~ B ~~~ C
    D ~~~ E ~~~ F
    C ~~~ G
    F ~~~ G
```

## Deadlock не только в БД

- **`lock` в C#** при захвате двух объектов в разном порядке.
- **Sync-over-async**: `.Result` в UI-потоке (см. вопрос про async/await).
- **Распределённые блокировки** (Redis) без TTL.

Принципы те же: единый порядок, короткие критические секции, таймауты.

## Вопросы на засыпку

:::qa Чем deadlock отличается от обычной блокировки (blocking)?
Blocking — одна транзакция ждёт другую, которая рано или поздно завершится и освободит ресурс. Deadlock — круговое ожидание, которое само не разрешится; его разрывает только СУБД, убивая жертву.
:::

:::qa Как СУБД выбирает жертву?
SQL Server — по умолчанию транзакцию с наименьшей стоимостью отката (можно влиять `SET DEADLOCK_PRIORITY`). PostgreSQL — ту, в процессе которой был обнаружен цикл (кто первым проверил после `deadlock_timeout`).
:::

:::qa Помогает ли NOLOCK от deadlock-ов?
Он убирает разделяемые блокировки чтения, но ценой грязного и неконсистентного чтения (пропущенные и дублированные строки). Правильное решение для SQL Server — `READ_COMMITTED_SNAPSHOT`: читатели работают с версиями строк и не блокируют писателей.
:::

:::qa Возможен ли deadlock в одной таблице и одной строке?
Да — при конверсии блокировок (оба держат S и хотят X) или при взаимодействии индексов: одна транзакция идёт по некластерному индексу к строке, другая — по кластерному к индексу, блокируя ключи в разном порядке.
:::

## Итог

Deadlock — круговое ожидание блокировок, которое СУБД разрывает, откатывая одну транзакцию. Снижайте вероятность единым порядком доступа, короткими транзакциями, индексами и захватом блокировки на изменение сразу при чтении; а в коде всегда предусматривайте повтор транзакции — под нагрузкой deadlock-и неизбежны.
