import {ComponentType} from "react";
import {IProvider} from "../vite-env";

export function compose(providers: ComponentType<IProvider>[]) {
    return providers.reduce(
        (PrevComponent, CurrComponent) =>
            ({children}: IProvider) => (
                <PrevComponent>
                    <CurrComponent>{children}</CurrComponent>
                </PrevComponent>
            )
    )
}