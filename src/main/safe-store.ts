// safe-store.ts
import fs from 'fs-extra'
import chokidar from 'chokidar'
import Store from 'electron-store'
import { EventEmitter } from 'events'

export type SafeStoreOptions = {
  /** Имя файла стора без расширения, как в electron-store (name: 'user_decks') */
  name: string
  /** Корневой ключ, который реально хранится в JSON (например 'decks' | 'cards' | 'featured' | 'settings') */
  rootKey: string
  /** Рабочая директория стора (cwd), если нужна */
  cwd?: string
  /** Значения по умолчанию — весь объект конфига electron-store (НЕ только rootKey) */
  defaults?: Record<string, any>
  /** Кастомный сериализатор (в dev красиво форматируем) */
  serialize?: (value: unknown) => string
  /** Миграции — ослаблено до any, чтобы не упираться в версии типов 'conf' */
  migrations?: any
  /** Порог стабилизации записи для chokidar.awaitWriteFinish */
  stabilityThresholdMs?: number
  /** Интервал опроса для chokidar.awaitWriteFinish */
  pollIntervalMs?: number
}

/**
 * SafeStore — обёртка над electron-store:
 * - сериализует ЗАПИСИ через очередь (Promise chain)
 * - слушает внешний файл через chokidar (облако/другой процесс)
 * - валидирует JSON перед событием (защита от «полузаписей»)
 * - дедуплицирует бурсты изменений
 */
export class SafeStore<TValue = any> {
  public readonly store: Store
  public readonly path: string
  private readonly rootKey: string
  private writeChain: Promise<void> = Promise.resolve()
  private writingNow = false
  private watcher: chokidar.FSWatcher | null = null
  private ee = new EventEmitter()
  private lastJson = '' // для дедупликации/сравнения
  private closed = false

  constructor(opts: SafeStoreOptions) {
    const { name, rootKey, cwd, defaults, serialize, migrations } = opts
    this.rootKey = rootKey

    this.store = new Store({
      name,
      cwd,
      defaults,
      serialize,
      migrations
    })

    // Путь до файла (есть в рантайме, но не типизирован)
    // @ts-ignore
    this.path = this.store.path as string

    // Инициализация lastJson (текущее состояние)
    const initVal = this.store.get(this.rootKey) as TValue
    this.lastJson = safeStringify(initVal)

    // Поднимем watcher для внешних изменений
    const stabilityThreshold = opts.stabilityThresholdMs ?? 600
    const pollInterval = opts.pollIntervalMs ?? 120

    this.watcher = chokidar.watch(this.path, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold, pollInterval }
    })

    this.watcher.on('change', (changedPath: string) => {
      // Если это «наша» запись — пропускаем одно срабатывание
      if (this.writingNow) return

      // Проверим, что JSON уже докатился и валиден
      try {
        const raw = fs.readFileSync(changedPath, 'utf8')
        JSON.parse(raw) // только валидация
      } catch {
        // файл ещё не докатился — дождёмся следующего события
        return
      }

      // Считываем актуальное значение через store (с миграциями и т.п.)
      const current = this.store.get(this.rootKey) as TValue
      const js = safeStringify(current)

      // Дедупликация: избегаем шторма одинаковых событий
      if (js === this.lastJson) return
      this.lastJson = js

      this.ee.emit('change', current)
    })
  }

  /** Прочитать актуальное значение корневого ключа */
  public get(): TValue {
    return this.store.get(this.rootKey) as TValue
  }

  /**
   * Поставить запись в очередь.
   * Возвращает промис, который завершится, когда запись докатится.
   */
  public setQueued(nextValue: TValue): Promise<void> {
    if (this.closed) return Promise.resolve()
    this.writeChain = this.writeChain
      .then(async () => {
        this.writingNow = true
        this.store.set(this.rootKey, nextValue as any)
        // Обновим lastJson сразу, чтобы локально не ловить лишнее событие
        this.lastJson = safeStringify(nextValue)
      })
      .catch((e) => {
        console.log(`[${this.rootKey}] write error:`, e)
      })
      .finally(() => {
        // небольшой хвост, чтобы chokidar не поймал «полузапись»
        setTimeout(() => {
          this.writingNow = false
        }, 120)
      })
    return this.writeChain
  }

  /**
   * Изменить значение через функцию-апдейтер (read-modify-write) в очереди.
   */
  public updateQueued(updater: (prev: TValue) => TValue): Promise<void> {
    const prev = this.get()
    const next = updater(prev)
    return this.setQueued(next)
  }

  /**
   * Подписка на любые изменения значения (наши записи + внешние изменения файла).
   * Возвращает функцию отписки.
   */
  public onChange(cb: (val: TValue) => void): () => void {
    const handler = (val: TValue) => cb(val)
    this.ee.on('change', handler)
    return () => this.ee.off('change', handler)
  }

  /** Закрыть watcher (вызвать на app.quit) */
  public async close(): Promise<void> {
    this.closed = true
    try { await this.writeChain } catch {}
    if (this.watcher) {
      try { await this.watcher.close() } catch {}
      this.watcher = null
    }
  }
}

function safeStringify(x: any): string {
  try { return JSON.stringify(x) } catch { return '' }
}
