// src/services/fnrh-service.ts

export interface FnrhDomain {
    id: string;
    label: string;
}

/**
 * FnrhService (Mock)
 * 
 * Este serviço simula os retornos da API da FNRH (Ficha Nacional de Registro de Hóspedes) 
 * Módulo Meio de Hospedagem (Manual v2.1 de 2026).
 * 
 * Quando as chaves de API reais estiverem disponíveis, basta substituir essas implementações 
 * estáticas por chamadas `fetch()` para os endpoints do Serpro, sem quebrar os componentes de View.
 */
export class FnrhService {

    /**
     * GET /dominios/fnrh/meios_transporte
     */
    static async getMeiosTransporte(): Promise<FnrhDomain[]> {
        return [
            { id: "AVIAO", label: "Avião" },
            { id: "CARRO", label: "Carro" },
            { id: "ONIBUS", label: "Ônibus" },
            { id: "NAVIO", label: "Navio" },
            { id: "TREM", label: "Trem" },
            { id: "MOTO", label: "Moto" },
            { id: "OUTRO", label: "Outro" }
        ];
    }

    /**
     * GET /dominios/fnrh/motivos_viagem
     */
    static async getMotivosViagem(): Promise<FnrhDomain[]> {
        return [
            { id: "TURISMO", label: "Turismo/Lazer" },
            { id: "NEGOCIOS", label: "Negócios/Trabalho" },
            { id: "CONGRESSO", label: "Congresso/Feira" },
            { id: "SAUDE", label: "Saúde" },
            { id: "RELIGIAO", label: "Religião" },
            { id: "ESTUDOS", label: "Estudos" },
            { id: "OUTRO", label: "Outros" }
        ];
    }

    /**
     * GET /dominios/pessoas/generos
     */
    static async getGeneros(): Promise<FnrhDomain[]> {
        return [
            { id: "MASCULINO", label: "Masculino" },
            { id: "FEMININO", label: "Feminino" },
            { id: "NAO_INFORMADO", label: "Não Informado" },
            { id: "OUTRO", label: "Outro" }
        ];
    }

    /**
     * GET /dominios/pessoas/racas
     */
    static async getRacas(): Promise<FnrhDomain[]> {
        return [
            { id: "BRANCA", label: "Branca" },
            { id: "PRETA", label: "Preta" },
            { id: "PARDA", label: "Parda" },
            { id: "AMARELA", label: "Amarela" },
            { id: "INDIGENA", label: "Indígena" },
            { id: "NAO_DECLARADO", label: "Não Declarado/Prefiro não dizer" }
        ];
    }

    /**
     * GET /dominios/pessoas/tipos_documento
     */
    static async getTiposDocumento(): Promise<FnrhDomain[]> {
        return [
            { id: "CPF", label: "CPF" },
            { id: "PASSAPORTE", label: "Passaporte" },
            { id: "RG", label: "RG (Registro Geral)" },
            { id: "CNH", label: "CNH" },
            { id: "OUTRO", label: "Outro" }
        ];
    }

}
