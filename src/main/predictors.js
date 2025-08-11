try {
    var ort = require('onnxruntime-node');
} catch (err) { }

const EXCEPT_SETS = new Set([10, 22, 51, 60])

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
  async predict(initial_ids, sampling_top_k = 5, pool = null) {
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
      if (currCount < this.get_max_copies(cid) && (!pool || pool.includes(cid)))
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

export class DraftRecommender {
  constructor(card_data, feature_names) {
    // 1) Словарь карт по ID
    this.cardInfo = new Map();
    card_data.forEach(card => {
      this.cardInfo.set(parseInt(card.id, 10), {
        ...card,
        classes: card.class, // в JSON поле называется "class"
        color: card.color,
        rarity: card.rarity,
        elite: card.elite,
        type: card.type,
        uniq: card.uniq,
        life: card.life,
        move: card.move,
        cost: card.cost,
        hit: card.hit,
        icons: card.icons
      });
    });
    // 2) Порядок признаков (нужно для размера тензора)
    this.featureNames = feature_names; // длина должна быть 196

    // 3) Вспомогательные константы из Go
    this.globalClasses = [
      "Акванит","Аккениец","Ангел","Архаалит","Боевая_машина","Болото","Врата",
      "Герой-воин","Герой-жрец","Герой-маг","Герой-разбойник","Гном","Город",
      "Горы","Демон","Дитя_Кронга","Дракон","Дух","Инквизитор","Йордлинг",
      "Ковен","Койар","Крысолюд","Лес","Линунг","Море","Нежить","Орк","Пират",
      "Постройка","Пустыня","Река","Речная_дева","Слуа","Степь","Страж_леса",
      "Тоа-Дан","Тролль","Элементаль","Эльф"
    ];
    this.globalIcons = [
      "ova","ovz","armor","regen","ovs","stamina",
      "zoal","zoz","direct","zoo","zor","zom","zot","zov"
    ];
    this.globalTypes = [0,1,2,3,4,5];
    this.predefinedCards = [40034,40014,20164,30160,30098,30096,30054,40199,40077];
  }

  async init(model_path) {
    this.session = await ort.InferenceSession.create(model_path);
    this.inputName  = this.session.inputNames[0];
    this.outputName = this.session.outputNames[0];
    //console.log('Используем input:', this.inputName, 'output:', this.outputName);
  }

  extractFeatures(_context_ids, _option_id, _all_option_ids) {
    // === 0. Привести все входные ID к числам ===
    const context_ids = _context_ids.map(id =>
      typeof id === 'string' ? parseInt(id, 10) : id
    );
    const option_id = typeof _option_id === 'string'
      ? parseInt(_option_id, 10)
      : _option_id;
    const all_option_ids = _all_option_ids.map(id =>
      typeof id === 'string' ? parseInt(id, 10) : id
    );

    // === 1. Контекстные признаки ===
    const totalContext = context_ids.length;
    const contextColors = {1:0,2:0,4:0,8:0,16:0,32:0};
    let contextElite = 0;
    const contextTypeCounts = {};
    this.globalTypes.forEach(t => contextTypeCounts[t] = 0);
    let lifeSum = 0, moveSum = 0;
    const contextClassCounts = {};
    this.globalClasses.forEach(c => contextClassCounts[c] = 0);
    const contextIconCounts = {};
    this.globalIcons.forEach(ic => contextIconCounts[ic] = 0);
    const contextPredefCounts = {};
    this.predefinedCards.forEach(id => contextPredefCounts[id] = 0);

    // Заполнить по каждой карте в контексте
    context_ids.forEach(cid => {
      const card = this.cardInfo.get(cid);
      if (!card) return;
      // Цвет
      if (contextColors[card.color] !== undefined) contextColors[card.color]++;
      // Elite
      if (card.elite) contextElite++;
      // Тип
      if (contextTypeCounts[card.type] !== undefined) contextTypeCounts[card.type]++;
      // Life & Move
      lifeSum += card.life;
      moveSum += card.move;
      // Классы
      card.classes.forEach(cls => {
        const key = cls.trim().replace(/ /g, "_");
        if (contextClassCounts[key] !== undefined) contextClassCounts[key]++;
      });
      // Иконки
      this.globalIcons.forEach(ic => {
        if (card.icons[ic] && card.icons[ic] !== 0) contextIconCounts[ic]++;
      });
      // Предопределённые карты
      if (contextPredefCounts[cid] !== undefined) contextPredefCounts[cid]++;
    });

    // Собираем массив контекстных фич
    const baseContext = [
      totalContext,
      contextColors[1], contextColors[2], contextColors[4],
      contextColors[8], contextColors[16], contextColors[32],
      contextElite
    ];
    const typeFeat = this.globalTypes.map(t => contextTypeCounts[t]);
    const aggFeat = [lifeSum, moveSum];
    const classFeat = this.globalClasses.map(c => contextClassCounts[c]);
    const iconFeat = this.globalIcons.map(ic => contextIconCounts[ic]);
    const predefFeat = this.predefinedCards.map(id => contextPredefCounts[id]);
    const contextFeatures = [
      ...baseContext,
      ...typeFeat,
      ...aggFeat,
      ...classFeat,
      ...iconFeat,
      ...predefFeat
    ];

    // === 2. Признаки опции ===
    const totalOptions = all_option_ids.length;
    const optionCard = this.cardInfo.get(option_id) || {};
    const optionColor = optionCard.color || 0;
    const optionRarity = optionCard.rarity || 0;
    const optionElite = optionCard.elite ? 1 : 0;
    const optionType = optionCard.type || 0;
    const optionUniq = optionCard.uniq ? 1 : 0;
    const baseOption = [
      totalOptions,
      optionColor, optionRarity, optionElite, optionType, optionUniq
    ];

    // Классы опции (one-hot по globalClasses)
    const optionClassFeat = this.globalClasses.map(cls =>
      (optionCard.classes || []).some(c=>c.trim().replace(/ /g,"_")===cls) ? 1 : 0
    );
    // Иконки опции (значения)
    const optionIconFeat = this.globalIcons.map(ic => optionCard.icons?.[ic] || 0);

    // Числовые параметры опции
    let hitAvg=0, hitMin=0, hitMax=0;
    if (optionCard.hit?.length) {
      hitMin = Math.min(...optionCard.hit);
      hitMax = Math.max(...optionCard.hit);
      hitAvg = optionCard.hit.reduce((s,v)=>s+v,0)/optionCard.hit.length;
    }
    const optionNumeric = [
      optionCard.cost || 0,
      optionCard.life || 0,
      optionCard.move || 0,
      hitAvg, hitMin, hitMax
    ];

    // === 3. Взаимодействующие признаки ===
    let costToLifeRatio=0, hitEfficiency=0, mobilityScore=0;
    if ((optionCard.cost||0) > 0) {
      costToLifeRatio = (optionCard.life||0) / optionCard.cost;
      hitEfficiency = hitAvg / optionCard.cost;
      mobilityScore = (optionCard.move||0) / optionCard.cost;
    }

    // === 4. Признаки кривой маны ===
    const costCounts = Array(10).fill(0);
    context_ids.forEach(cid => {
      const c = this.cardInfo.get(cid);
      if (c && c.cost>=0 && c.cost<10) costCounts[Math.floor(c.cost)]++;
    });
    const totalC = totalContext || 1;
    const costDist = costCounts.map(cnt => cnt/totalC);
    const idealCurve = [0.15,0.20,0.25,0.15,0.10,0.05,0.05,0.03,0.02,0.0];
    const curveNeeds = costDist.map((d,i)=> Math.max(0, idealCurve[i]-d));
    const optCostIdx = Math.floor(optionCard.cost||0);
    let curveImprovement=0, costSlotPercentage=0;
    if (optCostIdx>=0 && optCostIdx<10) {
      curveImprovement = curveNeeds[optCostIdx];
      costSlotPercentage = costDist[optCostIdx];
    }

    // === 5. Синергия ===
    // Цветовая
    const colorSynergy = this.globalTypes.map((col,i)=>
      (optionColor===[1,2,4,8,16,32][i]) ? contextColors[[1,2,4,8,16,32][i]] : 0
    );
    // Классовая
    const classSynergy = this.globalClasses.map(cls=>
      ((optionCard.classes||[]).map(c=>c.trim().replace(/ /g,"_")).includes(cls))
        ? contextClassCounts[cls] : 0
    );

    // === 6. Финальный вектор ===
    return [
      ...contextFeatures,
      ...baseOption,
      ...optionNumeric,
      ...optionClassFeat,
      ...optionIconFeat,
      costToLifeRatio, hitEfficiency, mobilityScore,
      curveImprovement, costSlotPercentage,
      ...colorSynergy,
      ...classSynergy
    ];
  }

  async predict(context_ids, option_ids) {
    // 1) Собираем фичи и создаём тензор [batchSize, featureDim]
    const featuresList = option_ids.map(opt =>
      this.extractFeatures(context_ids, opt, option_ids)
    );
    const flat = Float32Array.from(featuresList.flat());
    const tensor = new ort.Tensor(
      'float32',
      flat,
      [option_ids.length, this.featureNames.length]
    );

    // 2) Запускаем инференс без указания fetch list
    const resultMap = await this.session.run({ [this.inputName]: tensor });

    // 3) Логируем доступные выходы (только для отладки)
    //console.log('resultMap keys:', Object.keys(resultMap));
    //console.log('configured outputNames:', this.session.outputNames);

    // 4) Берём имя второго выхода — там лежит probabilities
    const probName = this.session.outputNames[1];
    const probTensor = resultMap[probName];
    if (!probTensor) {
      throw new Error(`Тензор "${probName}" не найден в результатах инференса`);
    }

    // 5) Извлекаем второй столбец (вероятность класса 1)
    const raw = probTensor.data;           // Float32Array длины batchSize*2
    const scores = [];
    for (let i = 0; i < option_ids.length; i++) {
      scores.push(raw[i * 2 + 1]);
    }

    // 6) Находим индекс максимума и собираем ответ
    let bestIdx = 0;
    for (let i = 1; i < scores.length; i++) {
      if (scores[i] > scores[bestIdx]) bestIdx = i;
    }
    const predictions = {};
    option_ids.forEach((opt, i) => {
      predictions[opt] = scores[i];
    });

    return {
      predictions,
      chosen_option: option_ids[bestIdx],
      chosen_index: bestIdx
    };
  }


}
