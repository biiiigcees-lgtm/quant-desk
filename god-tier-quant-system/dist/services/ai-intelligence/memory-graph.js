export class MemoryGraph {
    constructor() {
        this.nodes = [];
    }
    add(node) {
        this.nodes.push(node);
        if (this.nodes.length > 5000)
            this.nodes.shift();
    }
    queryByTag(tag) {
        return this.nodes.filter((node) => node.tags.includes(tag));
    }
    recent(limit = 20) {
        return this.nodes.slice(-limit);
    }
}
