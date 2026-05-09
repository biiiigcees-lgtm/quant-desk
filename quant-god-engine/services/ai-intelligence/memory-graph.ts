export interface MemoryNode {
  id: string;
  type: 'narrative' | 'anomaly' | 'regime' | 'pattern';
  text: string;
  timestamp: number;
  tags: string[];
}

export class MemoryGraph {
  private readonly nodes: MemoryNode[] = [];

  add(node: MemoryNode): void {
    this.nodes.push(node);
    if (this.nodes.length > 5000) this.nodes.shift();
  }

  queryByTag(tag: string): MemoryNode[] {
    return this.nodes.filter((node) => node.tags.includes(tag));
  }

  recent(limit: number = 20): MemoryNode[] {
    return this.nodes.slice(-limit);
  }
}
