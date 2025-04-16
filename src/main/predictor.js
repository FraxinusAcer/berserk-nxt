const ort = require('onnxruntime-node');

const EXCEPT_SETS = new Set([10, 22, 51])

export class DeckRecommender {
  constructor(card_data) {
    // Построение словарей: id_to_card, name_to_id, is_horde
    this.all_card_ids = []
    this.is_horde = new Set()
    for (const card of card_data.filter((card) => !EXCEPT_SETS.has(card.set_id) && !card.alt)) {
      const cid = parseInt(card.id, 10)
      this.all_card_ids.push(cid)
      if (card.horde) this.is_horde.add(cid)
    }

    this.all_card_ids.sort((a, b) => a - b)

    this.id_to_index = {}
    this.index_to_id = {}
    this.all_card_ids.forEach((cid, idx) => {
      this.id_to_index[cid] = idx
      this.index_to_id[idx] = cid
    });

    this.pad_index = this.all_card_ids.length
    this.vocab_size = this.pad_index

    this.banned = [20191, 20100]
  }

  async init(model_path) {
    this.session = await ort.InferenceSession.create(model_path)
  }

  get_max_copies(cid) {
    return this.is_horde.has(cid) ? 5 : 3
  }

  // Функция предсказания полной колоды, исходя из начального набора карт (и отрицательных)
  async predict(initial_ids, sampling_top_k = 5) {
    let indices = []
    for (const cid of initial_ids) {
      if (!(cid in this.id_to_index)) {
        console.warn("❌ Неизвестная карта:", cid)
        continue
      }
      indices.push(this.id_to_index[cid])
    }
    while (indices.length < 30) indices.push(this.pad_index);
    const inputTensor = new ort.Tensor("int64", new BigInt64Array(indices.map(x => BigInt(x))), [1, 30])
    const feeds = { input: inputTensor }
    const results = await this.session.run(feeds)
    const logitsTensor = results.output

    const logits = Array.from(logitsTensor.data);
    const scores = logits.map(x => 1 / (1 + Math.exp(-x)))

    let candidates = []
    const scoreObjs = scores.map((score, idx) => ({ idx, score }))
    scoreObjs.sort((a, b) => b.score - a.score)

    for (const obj of scoreObjs) {
      const idx = obj.idx
      if (idx >= this.vocab_size) continue
      const cid = this.index_to_id[idx]
      const currCount = initial_ids.filter((id) => id == cid).length
      if (currCount < this.get_max_copies(cid))
        candidates.push({ cid, score: obj.score });
      if (candidates.length >= sampling_top_k) break;
    }

    if (candidates.length === 0) return null
    const totalScore = candidates.reduce((sum, cand) => sum + cand.score, 0);
    let rand = Math.random() * totalScore;
    let chosenCid = candidates[0].cid;
    for (const cand of candidates) {
      rand -= cand.score;
      if (rand <= 0) {
        chosenCid = cand.cid;
        break;
      }
    }

    return `${chosenCid}`
  }
}
