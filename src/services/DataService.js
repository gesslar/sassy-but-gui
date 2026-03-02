export default class DataService {
  #glog

  constructor({glog}) {
    this.#glog = glog
  }

  #requiredKeys = {
    config: [
      "name", "type",
    ]
  }

  #suggestedKeys = {
    config: [
      "$schema"
    ]
  }

  validThemeSource(file, src) {
    const requiredMissing = this.#checkShapeOfSource(this.#requiredKeys, src)
    if(requiredMissing.length > 0) {
      this.#glog.error(
        `Sassy theme file '${file}' is missing the following keys: ` +
        `${requiredMissing.join(", ")}`
      )

      return false
    }

    const suggestedMissing = this.#checkShapeOfSource(this.#suggestedKeys, src)
    if(suggestedMissing.length > 0) {
      this.#glog.warn(
        `Sassy theme file '${file}' is missing the following suggested keys: ` +
        `${suggestedMissing.join(", ")}`
      )
    }

    return true
  }

  #checkShapeOfSource(prescribed, src) {
    const missing = []

    for(const [key, subs] of Object.entries(prescribed)) {
      if(!Object.hasOwn(src, key)) {
        missing.push(key)

        continue
      }

      for(const sub of subs) {
        if(!Object.hasOwn(src[key], sub))
          missing.push(`${key}.${sub}`)
      }
    }

    return missing
  }

}
