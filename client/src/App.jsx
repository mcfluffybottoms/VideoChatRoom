import { BrowserRouter, Routes, Route } from 'react-router-dom';

import StartScreen from './components/CreateRoom/StartScreen';
import './App.css';
import EnterRoom from './components/EnterRoom/EnterRoom';
import NotFound from './components/NotFound';

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<StartScreen />} />
                <Route path="/room/:roomId" element={<EnterRoom />} />
                <Route path="*" element={<NotFound />} />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
