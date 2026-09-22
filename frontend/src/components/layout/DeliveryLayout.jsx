import DeliveryHeader from "./DeliveryHeader";

const DeliveryLayout = ({ children }) => (
    <div className="min-h-screen flex flex-col bg-background">
        <DeliveryHeader />
        <main className="flex-1">{children}</main>
    </div>
);

export default DeliveryLayout;