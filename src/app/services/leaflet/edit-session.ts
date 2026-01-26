export type CloneFn<T> = (value: T) => T;
export type EqualFn<T> = (a: T, b: T) => boolean;

export type EditSessionSnapshot<T> = {
    baseline: T;
    committed: T;
};

export class EditSession<T> {
    private _baseline: T | null = null;
    private _committed: T | null = null;

    constructor(private readonly equals: EqualFn<T>, private readonly clone: CloneFn<T> ) { }


    /** Inizia una sessione: baseline = initial; committed = initial */
    start(initial: T): void {
        const init = this.clone(initial);
        this._baseline = init;
        this._committed = this.clone(init);
    }

    /** Ritorna true se la sessione è attiva */
    isActive(): boolean {
        return this._baseline !== null && this._committed !== null;
    }

    /** Ritorna  snapshot clonato per debug */
    snapshot(): EditSessionSnapshot<T> | null {
        if (!this.isActive()) return null;
        return {
            baseline: this.clone(this._baseline as T),
            committed: this.clone(this._committed as T),
        };
    }

    /** true se current diverso dal commited */
    isDirty(current: T): boolean {
        this.assertActive(`isDirty`);
        return !this.equals(current, this._committed as T);
    }

    /**aggiorna committed = clone(current) */
    commit(current: T): void{
        this.assertActive(`commit`);
        this._committed = this.clone(current);
    }

    /**ritorna una copia del baseline “Ripristina modifiche” */
    restoreBaseline(): T {
        this.assertActive(`restoreBaseline`);
        return this.clone(this._baseline as T);
    }

    /**ritorna una copia del committed “Esci senza salvare” */
    restoreCommitted(): T {
        this.assertActive(`restoreCommitted`);
        return this.clone(this._committed as T);
    }

    /** Termina la sessione, azzera baseline e committed */
    stop(): void {
        this._baseline = null;
        this._committed = null;
    }

    private assertActive(method: string): void {
        if (!this.isActive()) {
            throw new Error(`EditSession.${method} chiamato senza start().`);
        }
    }

}